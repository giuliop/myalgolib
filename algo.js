import { confPath, createConfFile } from './createConf.js'
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import algosdk from 'algosdk';

export { conf, algod, kmd, utils, algosdk };

if (! fs.existsSync(confPath))
	await createConfFile();

const conf = JSON.parse(fs.readFileSync(confPath));
// secret keys need to be manually converted to buffer and uint8array
for (let a of conf.accounts) {
	a.sk = new Uint8Array(Buffer.from(a.sk.data));
}

const algod = new algosdk.Algodv2(conf.algodToken, conf.server, conf.algodPort);
const kmd = new algosdk.Kmd(conf.kmdToken);

const utils = {
	compile,
	compileFile,
	signWithKmd,
	sendAndConfirm,
	signWithKmdSendAndConfirm,
	signWithSkSendAndConfirm,
	fund,
	createDryrunDumpFile
}

// Fund the provided address with the provided numner of algo from an account
// in the configuration
async function fund(address, algo) {
	const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject(
		{ amount : algo * 1000000,
			from : conf.addresses[0],
			to : address,
			suggestedParams : await algod.getTransactionParams().do()
		});

	await signWithKmdSendAndConfirm(txn);
	console.log(`Funded address ${address} with ${algo} algo \n`);
}

// Compile a file of teal code and return the compiled blob and the hash
// (the hash is the address in case of smart signature contract accounts)
async function compileFile(filepath) {
	const source = fs.readFileSync(filepath).toString();
	return compile(source);
}

// Compile a string of teal code and return the compiled blob and the hash
// (the hash is the address in case of smart signature contract accounts)
async function compile(source) {
	try {
		const resp = await algod.compile(source).do();
		const compiled = new Uint8Array(Buffer.from(resp.result, "base64"));
		return {compiled, hash: resp.hash}

	} catch (err) {
		console.log(`\n${err.rawResponse}\n`);
		throw Error(err.message);
	}
}

// Start the Kmd process; if timeout is provided (as seconds),
// automatically stop the process after it
function startKmd(timeout = null) {
	if (timeout && isFinite(timeout))
		execSync(`goal kmd start -t ${timeout} -d ${conf.nodeDir}`);
	else
		execSync(`goal kmd start -d ${conf.nodeDir}`);
}

// Stop the Kmd process
function stopKmd() {
	execSync("goal kmd stop -d " + conf.nodeDir);
}

// Take a txn and optionally the address what need to sign it (needed for rekeyed
// accounts), sign it wiwh Kmd and return the signed transaction
async function signWithKmd(txn, signingAddress = null) {
	let signedTxn;
	startKmd(5);

	const walletHandle = (await kmd.initWalletHandle(conf.walletId))
		.wallet_handle_token;

	if (signingAddress) {
		const { publicKey, _ } = algosdk.decodeAddress(signingAddress);
		signedTxn = await kmd.signTransactionWithSpecificPublicKey(
			walletHandle, "", txn, publicKey)

	} else {
		signedTxn = await kmd.signTransaction(walletHandle, "", txn);
	}

	kmd.releaseWalletHandle(walletHandle);
	return signedTxn;
}

// Take a signed txn and its ID, send it to the blockchain, await confirmation
// and return the responed
async function sendAndConfirm(signedTxn, txId) {
	await algod.sendRawTransaction(signedTxn).do();
	const confirmedTxn = await algosdk.waitForConfirmation(algod, txId, 4);
	console.log("\nTransaction " + txId + " confirmed in round "
		+ confirmedTxn["confirmed-round"] +"\n");
	const txnResponse = await algod.pendingTransactionInformation(txId).do();
	return txnResponse;
}

// Take a txn and o secrey key, sign, send to the blockchain, await confirmation
// and return the response
async function signWithSkSendAndConfirm(txn, sk) {
	const {blob, txID} = algosdk.signTransaction(txn, sk);
	const resp = await utils.sendAndConfirm(blob, txID);
	return resp;
}

// Take a txn and optionally the address what need to sign it (needed for rekeyed
// accounts), sign it wiwh Kmd, send it to the blockchain,await confirmation
// and return the response
async function signWithKmdSendAndConfirm(txn, signingAddress = null) {
	const txId = txn.txID().toString();
	const signedTxn = await signWithKmd(txn, signingAddress);
	const resp = await sendAndConfirm(signedTxn, txId);
	return resp;
}

async function createDryrunDumpFile(app_txn, sk) {
	const s_app_txn = algosdk.signTransaction(app_txn, sk)
	const drr = await algosdk.createDryrun({
		client: algod,
		txns: [ algosdk.decodeSignedTransaction(s_app_txn['blob'])]
	});

	const filename = 'dryrun.msgp';
	fs.writeFileSync(filename,
		algosdk.encodeObj(drr.get_obj_for_encoding(true)));
}

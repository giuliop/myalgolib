import algosdk from 'algosdk';
import { readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const confPath = path.join(__dirname, 'conf.json');
console.log(confPath);

export async function createConfFile() {
	const nodeDir = '/Users/giulio/dev/algorand/privateBetaNet/Node';

	const kmdDir = nodeDir + '/'
		+ readdirSync(nodeDir).filter(d => d.match(new RegExp(`^kmd-v*`)))[0];
	const kmdToken = execSync("cat kmd.token", { cwd : kmdDir}).toString();
	const kmd = new algosdk.Kmd(kmdToken);

	execSync("goal kmd start -t 5 -d " + nodeDir);
	const walletId = (await kmd.listWallets()).wallets[0].id;
	const walletHandle = (await kmd.initWalletHandle(walletId)).wallet_handle_token;
	const addresses = (await kmd.listKeys(walletHandle)).addresses;
	const accounts = [];
	for (const address of addresses) {
		const sk = (await kmd.exportKey(walletHandle, "", address)).private_key;
		accounts.push({address, sk});
	}
	kmd.releaseWalletHandle(walletHandle);

	const conf = {
		nodeDir,
		server : 'http://127.0.0.1',
		algodToken : execSync("cat algod.token", {cwd : nodeDir}).toString(),
		algodPort : +execSync("cat algod.net", {cwd : nodeDir})
		.toString()
		.split(':')[1],
		kmdToken,
		walletId,
		addresses,
		accounts
	}

	writeFileSync(confPath, JSON.stringify(conf));
}

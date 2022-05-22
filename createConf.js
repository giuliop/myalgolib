import algosdk from 'algosdk';
import { readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

export default async function() {
	const nodeDir = '/Users/giulio/dev/algorand/privateBetaNet/Node';

	const kmdDir = nodeDir + '/'
		+ readdirSync(nodeDir).filter(d => d.match(new RegExp(`^kmd-v*`)))[0];
	const kmdToken = execSync("cat kmd.token", { cwd : kmdDir}).toString();
	const kmd = new algosdk.Kmd(kmdToken);

	execSync("goal kmd start -t 5 -d " + nodeDir);
	const walletId = (await kmd.listWallets()).wallets[0].id;
	const walletHandle = (await kmd.initWalletHandle(walletId)).wallet_handle_token;
	const addresses = (await kmd.listKeys(walletHandle)).addresses;
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
	}

	writeFileSync('./conf.json', JSON.stringify(conf));
}

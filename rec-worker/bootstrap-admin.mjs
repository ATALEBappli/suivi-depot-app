// Hors ligne uniquement : aucun réseau, aucun mot de passe sur stdout/argv/env.
import {stdin,stdout} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {passwordRecord,usernameInput} from './passwords.mjs';
if(!stdin.isTTY || !stdout.isTTY || !process.argv[2]?.endsWith('.private.json'))throw Error('PRIVATE_TERMINAL_AND_NEW_FILE_REQUIRED');
const rl=createInterface({input:stdin,output:stdout});let password='';
try{
 const username=usernameInput(await rl.question('Identifiant administrateur : '));rl.close();
 stdout.write('Mot de passe (masqué, 15 caractères minimum) : ');stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');
 password=await new Promise((resolve,reject)=>{const listener=chunk=>{for(const c of chunk){if(c==='\u0003'){stdin.off('data',listener);reject(Error('CANCELLED'));return;}if(c==='\r' || c==='\n'){stdin.off('data',listener);resolve(password);return;}if(c==='\u007f')password=[...password].slice(0,-1).join('');else password+=c;}};stdin.on('data',listener);});
 stdin.setRawMode(false);stdin.pause();stdout.write('\n');
 const record={id:randomUUID(),username,role:'admin',password:await passwordRecord(password)};password='';
 writeFileSync(process.argv[2],JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});stdout.write('Fichier privé créé. Ne pas le versionner ni le partager.\n');
}catch{stdout.write('\nInitialisation annulée ou données invalides.\n');process.exitCode=1;}finally{if(stdin.isRaw)stdin.setRawMode(false);stdin.pause();rl.close();password='';}

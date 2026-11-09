import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const folder=process.argv[2];assert(/^release[/\\]131-\d+$/.test(folder),'Informe a pasta de um ensaio local.');
const stamp=folder.split(/[/\\]/).at(-1).slice(4),name=`fisio_adm131_${stamp}`;
const password=execFileSync('docker',['exec','fisio-adm99-test','printenv','POSTGRES_PASSWORD'],{encoding:'utf8'}).trim();assert(password);
const localUrl=`postgresql://fisio:${encodeURIComponent(password)}@127.0.0.1:55499/${name}?schema=public`;
const env={...process.env,DATABASE_URL:localUrl,DATABASE_URL_UNPOOLED:localUrl,ADM131_LOCAL_SYNTHETIC:'1'};
const mode=process.argv[3]??'exports';assert(['exports','boundaries'].includes(mode));
execFileSync(process.execPath,['--import','tsx','--conditions=react-server',`scripts/administrativo/capacity-${mode==='exports'?'verify':'boundaries'}.ts`,folder],{env,stdio:'inherit'});

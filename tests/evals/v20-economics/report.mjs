#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { buildReport, renderMarkdown } from './lib/report.mjs';
const help='Usage: node report.mjs --input <json> [--format json|markdown]\nOffline explicit-input reporting; exit 0 is not an acceptance claim.\n';
async function main(args){
  if(args.length===1&&args[0]==='--help'){process.stdout.write(help);return;}
  const options={};
  for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--input','--format'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(options,key))throw new Error('arguments');options[key]=value;}
  if(!options['--input']||!['json','markdown'].includes(options['--format']??'json'))throw new Error('arguments');
  const report=buildReport(JSON.parse(await readFile(options['--input'],'utf8')));
  process.stdout.write(options['--format']==='markdown'?renderMarkdown(report):JSON.stringify(report,null,2)+'\n');
}
try{await main(process.argv.slice(2));}catch{process.stderr.write('Economics report: invalid arguments, unreadable input, or invalid experiment. Use --help.\n');process.exitCode=2;}

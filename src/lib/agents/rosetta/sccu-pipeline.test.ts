// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { runRosettaRead } from './read';
import { runKnoxExtract } from '../knox/extract';

const sourceUrl='https://www.sccu.com/getmedia/5c409f02-961e-4902-95a0-acd33bd4eca0/Fee-Schedule.pdf';

describe('official SCCU consumer schedule regression',()=>{
 it('preserves actual PDF rows and extracts fees rather than balance thresholds',async()=>{
  const bytes=new Uint8Array(await readFile(new URL('./fixtures/sccu-consumer-2025-03-12.pdf',import.meta.url)));
  const sourceHash=createHash('sha256').update(bytes).digest('hex');
  expect(sourceHash).toBe('933fe958b2a7ad57749e10b14d1991c4eb0fc40ca31811d5c0478beb514b166f');
  const stored:Array<unknown[]> = [];
  const readDb=Object.assign(vi.fn((...args:unknown[])=>{stored.push(args);return Promise.resolve([]);}),{unsafe:vi.fn().mockResolvedValue([{source_document_id:1,institution_id:8109,institution_name:'Space Coast Credit Union',document_url:sourceUrl,content_hash:sourceHash}])});
  const result=await runRosettaRead({runId:1,db:readDb as unknown as NonNullable<Parameters<typeof runRosettaRead>[0]['db']>,fetchImpl:vi.fn().mockResolvedValue(new Response(bytes,{headers:{'content-type':'application/pdf'}}))});
  expect(result.completed).toBe(1);
  const artifact=stored.find(args=>Array.isArray(args[0])&&(args[0] as string[]).join('').includes('INSERT INTO agent_source_texts'));
  const normalizedText=artifact?.find(v=>typeof v==='string'&&v.includes('Money Market Savings Account')) as string;
  expect(normalizedText).toContain('[Page 1]\n');
  expect(normalizedText.split('\n').length).toBeGreaterThan(25);
  const db=Object.assign(vi.fn(),{unsafe:vi.fn().mockResolvedValue([{document_text_id:1,source_document_id:1,institution_id:8109,institution_name:'Space Coast Credit Union',source_url:sourceUrl,text_hash:createHash('sha256').update(normalizedText).digest('hex'),normalized_text:normalizedText}])});
  const extraction=await runKnoxExtract({runId:1,dryRun:true,db:db as unknown as NonNullable<Parameters<typeof runKnoxExtract>[0]['db']>});
  const candidates=extraction.results[0].candidates;
  expect(candidates.find(c=>c.feeName.startsWith('Interest Checking'))).toMatchObject({amount:15,frequency:'monthly'});
  expect(candidates.find(c=>c.feeName.startsWith('Money Market'))).toMatchObject({amount:15,frequency:'monthly'});
  expect(candidates.find(c=>c.canonicalHint==='overdraft')).toMatchObject({amount:30});
  expect(candidates.find(c=>c.canonicalHint==='dormant_account')).toMatchObject({amount:5,frequency:'monthly'});
  expect(candidates.find(c=>c.canonicalHint==='wire_domestic_outgoing')).toMatchObject({amount:25});
  expect(candidates.find(c=>c.canonicalHint==='wire_intl_outgoing')).toMatchObject({amount:40});
  expect(candidates.find(c=>c.canonicalHint==='atm_non_network')).toMatchObject({amount:2.5});
  expect(candidates.some(c=>c.amount===1500||c.amount===2500)).toBe(false);
  expect(candidates.some(c=>c.canonicalHint==='nsf')).toBe(false);
  expect(candidates.some(c=>c.canonicalHint==='wire_domestic_incoming')).toBe(false);
  expect(db).not.toHaveBeenCalled();
 });
});

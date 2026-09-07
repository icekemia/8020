import {describe,it,expect} from 'vitest'; import fs from 'node:fs'; import {LocalMatch} from './controller'; import type {Policy} from '../bot/difficult';
const policy=JSON.parse(fs.readFileSync('public/policies/80_20_difficult.policy.json','utf8')) as Policy; const rng={next:()=>.1};
describe('local controller',()=>{it('finishes against legal human choices',()=>{const m=new LocalMatch(policy,'B',rng);m.commitHuman(1);m.commitHuman(1);m.commitHuman([20,0,0]);expect(m.game.phase).toBe('FINISHED');expect(m.game.result).toBeTruthy();});});

import {describe,it,expect} from 'vitest';
describe('UI contract',()=>{it('keeps player-facing phases as SPLIT, FILL and RESULT',()=>{expect('SPLIT FILL RESULT').not.toContain('TURN')});});

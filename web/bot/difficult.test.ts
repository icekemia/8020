import {describe,it,expect} from 'vitest'; import {sample,PolicyError} from './difficult';
describe('sampler',()=>{it('is deterministic',()=>expect(sample([['a',.2],['b',.8]],{next:()=>.1})).toBe('a'));it('rejects missing mass',()=>expect(()=>sample([['a',.5]],{next:()=>.1})).toThrow(PolicyError));});

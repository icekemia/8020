import {describe,it,expect,vi} from 'vitest'; import {render,screen,fireEvent} from '@testing-library/react'; import {App} from './main';
const policy={split1:{A:[[1,1]],B:[[1,1]]},split2:{'A1=1|B1=1|P=B':[[1,1]]},fill:{'D=0,0,0|P=B':[[[20,0,0],1]]}};
describe('UI flow',()=>it('starts and shows SPLIT',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>policy}));render(<App/>);fireEvent.click(screen.getByText('Start'));expect(await screen.findByText('SPLIT')).toBeTruthy()}));

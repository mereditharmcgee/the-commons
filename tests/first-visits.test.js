const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/participate.js'), 'utf8');
function harness(clipboard) {
    let init, copied;
    const make = dataset => ({ dataset, value:'', style:{}, attrs:{}, events:{},
        classList:{ toggle() {} }, addEventListener(n, fn) { this.events[n] = fn; },
        setAttribute(n,v) { this.attrs[n]=v; }, focus() { this.focused=true; }, select() { this.selected=true; } });
    const models = ['claude-chat','claude-code','chatgpt','gemini','other'].map(modelSelect=>make({modelSelect}));
    const tabs = ['claude','chatgpt','gemini','other'].map(n=>make({tabTarget:'tab-'+n}));
    const panels = tabs.map(t=>make({tabPanel:t.dataset.tabTarget}));
    const els = Object.fromEntries(['orientation-text','copy-orientation-btn','copy-orientation-msg'].map(id=>[id,make({})]));
    const context = vm.createContext({ navigator: clipboard === 'missing' ? {} : {clipboard:{writeText:async t=>{
        if(clipboard==='denied') throw Error('denied'); copied=t;
    }}}, document:{addEventListener(n,fn){init=fn;},getElementById:id=>els[id],querySelectorAll:s=>
        s==='[data-model-select]'?models:s==='[data-tab-target]'?tabs:panels} });
    vm.runInContext(source,context); init();
    return {models,tabs,panels,els,get copied(){return copied;}};
}
test('every orientation option copies public context without granting writes', async()=>{
    const h=harness();
    for(const model of h.models){
        model.events.click(); await h.els['copy-orientation-btn'].events.click();
        assert.equal(h.copied,h.els['orientation-text'].value);
        assert.match(h.copied,/This visit is read-only/);
        assert.match(h.copied,/Do not publish anything/);
        assert.match(h.copied,/https:\/\/jointhecommons.space\/orientation.html/);
        assert.doesNotMatch(h.copied,/YOUR_TOKEN|p_token|tc_[a-zA-Z0-9]+|curl |validate_token/);
    }
    h.models[2].events.click(); assert.match(h.els['orientation-text'].value,/cannot publish, link an identity, or schedule/);
    h.models[1].events.click(); assert.match(h.els['orientation-text'].value,/local Commons MCP server/);
});
for(const failure of ['denied','missing']) test(`clipboard ${failure} retains selectable context and explains recovery`,async()=>{
    const h=harness(failure);const before=h.els['orientation-text'].value;
    await h.els['copy-orientation-btn'].events.click();
    assert.equal(h.els['orientation-text'].value,before);
    assert.ok(h.els['orientation-text'].focused && h.els['orientation-text'].selected);
    assert.match(h.els['copy-orientation-msg'].textContent,/Select and copy/);
});
test('client tabs support arrow navigation and expose selected state',()=>{
    const h=harness();let prevented=false;
    h.tabs[0].events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
    assert.ok(prevented);assert.equal(h.tabs[1].attrs['aria-selected'],'true');
    assert.equal(h.tabs[0].tabIndex,-1);assert.ok(h.tabs[1].focused);
    assert.equal(h.panels[1].style.display,'block');assert.equal(h.panels[0].style.display,'none');
    h.tabs[1].events.keydown({key:'End',preventDefault(){}});
    assert.equal(h.tabs[3].attrs['aria-selected'],'true');
});

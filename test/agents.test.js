import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeCodex,normalizeClaude} from '../src/agents.js';
test('Codex speaks assistant deltas, never reasoning/tool output',()=>{
 assert.deepEqual(normalizeCodex({method:'item/agentMessage/delta',params:{delta:'hello'}}),[{type:'text',text:'hello'}]);
 assert.deepEqual(normalizeCodex({method:'item/reasoning/textDelta',params:{delta:'private'}}),[]);
 assert.deepEqual(normalizeCodex({method:'item/commandExecution/outputDelta',params:{delta:'log'}}),[]);
});
test('Claude normalizes partials and system ID, not tool content',()=>{
 assert.deepEqual(normalizeClaude({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'hello'}}}),[{type:'text',text:'hello'}]);
 assert.deepEqual(normalizeClaude({type:'system',subtype:'init',session_id:'same-id'}),[{type:'session',id:'same-id'}]);
 assert.deepEqual(normalizeClaude({type:'stream_event',event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'private'}}}),[]);
});

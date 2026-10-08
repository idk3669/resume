import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl, selectJobs, matchJob, initialProfile, emptyFilters, demoJobs} from '../web/src/jobs/model.js';

test('protocol validation prevents script and data URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(safeUrl('https://example.org/jobs/1'), 'https://example.org/jobs/1');
});
test('distance filters exclude unknown locations but retain zero distance', () => {
  const rows = [{...demoJobs[0],distance:0},{...demoJobs[1],distance:null},{...demoJobs[2],distance:20}];
  assert.deepEqual(selectJobs(rows,{},'all',{...emptyFilters,distance:'5'},initialProfile).map(j=>j.id),[rows[0].id]);
});
test('excluded jobs stay outside main board and can be recovered', () => {
  const statuses = {[demoJobs[0].id]:'excluded'};
  assert.equal(selectJobs(demoJobs,statuses,'all',emptyFilters,initialProfile).length,3);
  assert.equal(selectJobs(demoJobs,statuses,'excluded',emptyFilters,initialProfile).length,1);
});
test('personal Kubernetes experience is never counted as company experience', () => {
  const result = matchJob(demoJobs[0],initialProfile);
  assert.ok(result.work.includes('BOSH'));
  assert.ok(!result.work.includes('Kubernetes'));
  assert.ok(result.personal.includes('Kubernetes'));
});
test('multiple filters combine and profile edits change evidence', () => {
  assert.equal(selectJobs(demoJobs,{},'all',{...emptyFilters,query:'TAS',region:'경기'},initialProfile).length,0);
  assert.equal(matchJob(demoJobs[0],{...initialProfile,professional:''}).work.length,0);
});
test('inactive postings remain accessible in closed and saved tabs, not the active board', () => {
  const rows=[{...demoJobs[0],active:false}];
  const statuses={[rows[0].id]:'saved'};
  assert.equal(selectJobs(rows,statuses,'all',emptyFilters,initialProfile).length,0);
  assert.equal(selectJobs(rows,statuses,'closed',emptyFilters,initialProfile).length,1);
  assert.equal(selectJobs(rows,statuses,'saved',emptyFilters,initialProfile).length,1);
});

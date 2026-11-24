import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../docs/rec/oauth-public/',import.meta.url);
const pages=['index.html','confidentialite.html','conditions.html'];

test('les trois pages publiques REC sont autonomes et liées',()=>{
  for(const file of pages){
    const html=readFileSync(new URL(file,root),'utf8');
    assert.match(html,/<!doctype html>/i);
    assert.match(html,/<html lang="fr">/);
    assert.match(html,/<meta name="viewport"/);
    for(const target of pages)assert.ok(html.includes(`href="${target}"`),`${file} doit relier ${target}`);
    assert.doesNotMatch(html,/<script\b|<form\b|<iframe\b/i);
    assert.doesNotMatch(html,/refresh_token|client_secret|REC_GATEWAY_KEY|AKfycb/i);
  }
});

test('les limites REC et les mentions à valider sont explicites',()=>{
  const home=readFileSync(new URL('index.html',root),'utf8');
  const privacy=readFileSync(new URL('confidentialite.html',root),'utf8');
  assert.match(home,/environnement de recette/);
  assert.match(home,/locataires/);
  assert.match(privacy,/À compléter avant publication/);
  assert.match(privacy,/durées de conservation/);
});

import assert from 'node:assert/strict';
import { listSkills, prompt, skillsText } from './prompts.js';

// every skill file has a name and a one-line description to choose by
const skills = listSkills();
assert.ok(skills.length >= 7, `expected the bundled skills, found ${skills.length}`);
for (const s of skills) {
  assert.match(s.name, /^[a-z0-9-]+$/);
  assert.ok(
    s.description.length > 20 && !s.description.includes('\n'),
    `${s.name} needs a description line`
  );
}

// the chosen skills come back without their description line; unknown names are ignored
const text = skillsText(['accessibility', 'does-not-exist', 'react-patterns']);
assert.ok(text.startsWith('# Accessibility'));
assert.ok(text.includes('# React patterns'));
assert.ok(!/^description:/im.test(text));
assert.equal(skillsText([]), '');

// team prompts still get the shared rules, standalone ones do not
assert.ok(prompt('worker').startsWith('You are one agent'));
assert.ok(!prompt('site-ai').startsWith('You are one agent'));

console.log(`prompts ok (${skills.length} skills: ${skills.map((s) => s.name).join(', ')})`);

import { mkdir, writeFile } from 'node:fs/promises';
const instruments = { piano: 'acoustic_grand_piano', guitar: 'acoustic_guitar_nylon', marimba: 'marimba', organ: 'drawbar_organ', keys: 'electric_piano_1', bass: 'synth_bass_1', lead: 'lead_2_sawtooth', pad: 'pad_2_warm' };
await mkdir('public/sounds', { recursive: true });
for (const [kind, name] of Object.entries(instruments)) {
  const response = await fetch(`https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/${name}-mp3.js`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();
  const bank = JSON.parse(text.slice(text.lastIndexOf('= {') + 2, text.lastIndexOf('}') + 1).replace(/,\s*}/g, '}'));
  if (Object.keys(bank).length < 80 || !Object.values(bank).every(v => typeof v === 'string' && v.startsWith('data:audio/mp3;base64,'))) throw new Error(`Invalid sample bank: ${name}`);
  await writeFile(`public/sounds/${kind}.json`, JSON.stringify(bank));
  console.log(`${kind}: ${Object.keys(bank).length} samples`);
}

const response = await fetch('https://raw.githubusercontent.com/dave4mpls/midi-js-soundfonts-with-drums/gh-pages/drums-mp3.js');
if (!response.ok) throw new Error('Could not download drum samples');
const text = await response.text();
const bank = JSON.parse(text.slice(text.lastIndexOf('= {') + 2, text.lastIndexOf('}') + 1).replace(/,\s*}/g, '}'));
if (!['C2', 'D2', 'Gb2', 'Eb2'].every(key => bank[key]?.startsWith('data:audio/mp3;base64,'))) throw new Error('Invalid drum samples');
await writeFile('public/sounds/drums.json', JSON.stringify(bank));

// Deepgram Aura-2 English catalog, checked 2026-09-19.
// https://developers.deepgram.com/docs/tts-models
const feminine = 'Amalthea Andromeda Asteria Athena Aurora Callista Cora Cordelia Delia Electra Harmonia Helena Hera Iris Janus Juno Luna Minerva Ophelia Pandora Phoebe Selene Thalia Theia Vesta';
const masculine = 'Apollo Arcas Aries Atlas Draco Hermes Hyperion Jupiter Mars Neptune Odysseus Orion Orpheus Pluto Saturn Zeus';
const accents = {Amalthea:'Filipino',Pandora:'British',Draco:'British',Theia:'Australian',Hyperion:'Australian',Janus:'American Southern'};
const notes = {Helena:'Raspy and friendly',Hera:'Warm and smooth',Delia:'Breathy and casual',Pandora:'Breathy and melodic',Juno:'Melodic and expressive',Athena:'Calm and mature',Cora:'Melodic and caring'};
export const deepgramVoices = [
 ...feminine.split(' ').map(name=>({name,gender:'Feminine'})),
 ...masculine.split(' ').map(name=>({name,gender:'Masculine'})),
].map(v=>({...v,model:`aura-2-${v.name.toLowerCase()}-en`,accent:accents[v.name]||'American',description:notes[v.name]||''}));
export const deepgramVoice = model => deepgramVoices.find(v=>v.model===model);

import {BUILTIN_PRESETS} from '../ai/prompts.js';
const KEY = 'cpa.customPresets.v1';
export async function listPresets(storage=chrome.storage.local) {
  const saved = (await storage.get(KEY))[KEY];
  const custom = Array.isArray(saved) ? saved.filter(p=>typeof p?.id==='string' && p.id.startsWith('custom-') && typeof p.name==='string' && typeof p.prompt==='string').map(p=>({...p,fields:BUILTIN_PRESETS[0].fields,custom:true})) : [];
  return [...BUILTIN_PRESETS,...custom];
}
export async function savePreset({id,name,prompt},storage=chrome.storage.local) {
  name=name.trim(); prompt=prompt.trim();
  if(!name || !prompt) throw new Error('프리셋 이름과 프롬프트를 입력해주세요.');
  if(name.length>80 || prompt.length>8000) throw new Error('이름은 80자, 프롬프트는 8,000자 이내로 입력해주세요.');
  const presets=(await listPresets(storage)).filter(p=>p.custom);
  if(id && !presets.some(p=>p.id===id)) throw new Error('수정할 사용자 프리셋을 찾을 수 없습니다.');
  const next={id:id || `custom-${crypto.randomUUID()}`,name,prompt,custom:true};
  const index=presets.findIndex(p=>p.id===id);
  if(index>=0) presets[index]=next; else presets.push(next);
  await storage.set({[KEY]:presets}); return next;
}
export async function deletePreset(id,storage=chrome.storage.local) {
  if(!id.startsWith('custom-')) throw new Error('기본 프리셋은 삭제할 수 없습니다.');
  await storage.set({[KEY]:(await listPresets(storage)).filter(p=>p.custom && p.id!==id)});
}

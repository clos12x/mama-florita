/* Mamá Florita – Recordatorios con voz (femenina, castellano) */

let reminders = [];
const listEl = document.getElementById('list');
const msgEl = document.getElementById('msg');
const presetEl = document.getElementById('preset');
const whenEl = document.getElementById('when');
const repeatEl = document.getElementById('repeat');
const btnSave = document.getElementById('save');
const btnTest = document.getElementById('testVoice');
const btnAskNoti = document.getElementById('askNoti');
const btnInstall = document.getElementById('btnInstall');

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  btnInstall.hidden = false;
});
btnInstall?.addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  btnInstall.hidden = true;
});

/* --------- Service Worker --------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(console.warn);
}

/* --------- Notificaciones --------- */
async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}
btnAskNoti.addEventListener('click', ensureNotificationPermission);

/* --------- Voz (forzar femenina en castellano) --------- */
let chosenVoice = null;

// Nombres comunes de voces femeninas en ES (Windows/Google)
const FEMALE_NAME_HINTS =
  /(sabina|elena|luc[ií]a|conchita|isabel|m[óo]nica|sofi[áa]|mar[ií]a|carla|paula|helena|female|femenina|google espa[nñ]ol)/i;

function pickSpanishFemaleVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices || !voices.length) return;

  // 1) Intentar exactamente Microsoft Sabina
  let v = voices.find(v => /sabina/i.test(v.name));

  // 2) Otras voces femeninas por nombre
  if (!v) v = voices.find(v => FEMALE_NAME_HINTS.test(v.name));

  // 3) Preferir voces cuyo lang empiece con "es"
  if (!v) {
    const esVoices = voices.filter(v => /^es([-_]|$)/i.test(v.lang));
    // entre las ES, intenta femenina por nombre
    v = esVoices.find(v => FEMALE_NAME_HINTS.test(v.name)) || esVoices[0];
  }

  // 4) Último recurso
  chosenVoice = v || voices[0] || null;

  // Debug opcional: ver qué voz tomó
  // console.log('Voz elegida:', chosenVoice?.name, chosenVoice?.lang);
}

// Asegura que las voces estén cargadas antes de elegir
function waitForVoicesThenPick() {
  if (speechSynthesis.getVoices().length) {
    pickSpanishFemaleVoice();
  } else {
    // Algunos navegadores cargan voces asíncronamente
    speechSynthesis.onvoiceschanged = () => pickSpanishFemaleVoice();
    // Fallback adicional
    setTimeout(pickSpanishFemaleVoice, 800);
  }
}
waitForVoicesThenPick();

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  // Forzar castellano; si la voz elegida tiene otro es-*, se respeta
  u.lang = chosenVoice?.lang || 'es-ES';
  if (chosenVoice) u.voice = chosenVoice;
  u.pitch = 1.1;  // un poco más dulce
  u.rate  = 0.95; // un poco más pausado
  u.volume = 1;

  speechSynthesis.cancel(); // limpia colas previas
  speechSynthesis.speak(u);
}

/* --------- Persistencia --------- */
function load() {
  try { reminders = JSON.parse(localStorage.getItem('reminders_v1') || '[]'); }
  catch { reminders = []; }
}
function save() {
  localStorage.setItem('reminders_v1', JSON.stringify(reminders));
}

/* --------- UI --------- */
presetEl.addEventListener('change', () => {
  if (presetEl.value && !msgEl.value.trim()) msgEl.value = presetEl.value;
});
btnTest.addEventListener('click', () => {
  speak("Hijito, aquí Mamá Florita. Estoy contigo. Respira y sigue con calma, mi cielo.");
});

btnSave.addEventListener('click', () => {
  const txt = (msgEl.value || presetEl.value || '').trim();
  const when = whenEl.value;
  if (!txt) { alert('Escribe o elige un mensaje.'); return; }
  if (!when) { alert('Selecciona fecha y hora.'); return; }

  const id = crypto.randomUUID();
  const item = {
    id,
    text: txt,
    when: new Date(when).toISOString(),
    repeat: repeatEl.value, // none | daily
    done: false,
    fired: false
  };
  reminders.push(item);
  save(); render(); schedule(); msgEl.value = ''; presetEl.value = '';
  alert('✔ Recordatorio guardado');
});

function render() {
  listEl.innerHTML = '';
  if (!reminders.length) {
    listEl.innerHTML = '<li class="item"><small>No tienes recordatorios aún.</small></li>';
    return;
  }
  // Orden por fecha
  const sorted = [...reminders].sort((a,b)=> new Date(a.when)-new Date(b.when));
  for (const r of sorted) {
    const li = document.createElement('li');
    li.className = 'item';
    const dt = new Date(r.when);
    const badge = r.repeat === 'daily' ? '<span class="badge">Diario</span>' : '';
    li.innerHTML = `
      <div><strong>${r.text}</strong> ${badge}<br><small>${dt.toLocaleString()}</small></div>
      <div>
        <button data-id="${r.id}" class="say ghost">Escuchar ahora</button>
      </div>
      <div style="display:flex; gap:8px;">
        <button data-id="${r.id}" class="done ghost">${r.done ? 'Marcar pendiente' : 'Marcar hecho'}</button>
        <button data-id="${r.id}" class="del danger">Eliminar</button>
      </div>
    `;
    listEl.appendChild(li);
  }
  listEl.querySelectorAll('.say').forEach(b=>b.onclick = e=>{
    const r = reminders.find(x=>x.id===b.dataset.id);
    if (r) speak(r.text);
  });
  listEl.querySelectorAll('.done').forEach(b=>b.onclick = e=>{
    const r = reminders.find(x=>x.id===b.dataset.id);
    if (!r) return;
    r.done = !r.done; save(); render();
  });
  listEl.querySelectorAll('.del').forEach(b=>b.onclick = e=>{
    reminders = reminders.filter(x=>x.id!==b.dataset.id);
    save(); render();
  });
}

/* --------- Programación de avisos ---------
   IMPORTANTE: en la web, los temporizadores son fiables si la PWA está abierta
   o en segundo plano (no "cerrada" por el sistema). Si el sistema la duerme,
   reactivará avisos al abrir la app.
-------------------------------------------- */
let timer = null;
function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(checkReminders, 30 * 1000); // cada 30 s
  checkReminders();
}

async function fireReminder(r) {
  // Notificación
  const granted = await ensureNotificationPermission();
  if (granted) {
    const sw = await navigator.serviceWorker.getRegistration();
    const opts = {
      body: r.text,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [120, 60, 120],
      data: { id: r.id }
    };
    if (sw) sw.showNotification('🌸 Mamá Florita', opts);
    else new Notification('🌸 Mamá Florita', opts);
  }
  // Voz
  speak(r.text);

  // Repetición diaria
  if (r.repeat === 'daily') {
    const next = new Date(r.when);
    next.setDate(next.getDate() + 1);
    r.when = next.toISOString();
    r.fired = false;
  } else {
    r.fired = true;
  }
  save(); render();
}

function checkReminders() {
  const now = Date.now();
  for (const r of reminders) {
    if (r.done) continue; // ignorar hechos
    const t = new Date(r.when).getTime();
    if (!r.fired && t <= now) {
      fireReminder(r).catch(console.warn);
    }
  }
}

/* --------- Inicializar --------- */
load(); render(); schedule();

// Autocompletar fecha con el próximo minuto
(function presetDate(){
  const d = new Date(Date.now()+ 60*1000);
  d.setSeconds(0,0);
  const iso = d.toISOString().slice(0,16);
  whenEl.value = iso;
})();

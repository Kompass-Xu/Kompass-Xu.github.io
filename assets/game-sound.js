const profiles = {
  wood: { duration: .13, notes: [[256, .30, 29], [698, .23, 49], [1080, .13, 56]], noise: .17, decay: 40 },
  cloth: { duration: .19, notes: [[375, .13, 26], [562, .09, 26]], noise: .35, decay: 19 },
  water: { duration: .24, notes: [[565, .34, 21, -195], [832, .16, 24, -285]], noise: .15, decay: 21 },
  chime: { duration: .29, notes: [[469, .24, 14], [704, .23, 16], [939, .10, 19]], noise: .07, decay: 34 }
};

let audio;
let output;
let lastStart = -Infinity;
const samples = new Map();

function makeSample(profile) {
  const rate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.ceil(rate * profile.duration), rate);
  const channel = buffer.getChannelData(0);
  let previousNoise = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const time = index / rate;
    previousNoise = previousNoise * .68 + (Math.random() * 2 - 1) * .32;
    let value = previousNoise * profile.noise * Math.exp(-time * profile.decay);
    for (const [frequency, amplitude, decay, bend = 0] of profile.notes) {
      const cycles = frequency * time + bend * time * time / (2 * profile.duration);
      value += amplitude * Math.sin(2 * Math.PI * cycles) * Math.exp(-time * decay);
    }
    const fade = Math.min(1, time * 320, (profile.duration - time) * 160);
    channel[index] = value * fade;
  }
  return buffer;
}

export async function playGameSound(name = "wood") {
  if (name === "none") return;
  try {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = new Context();
      output = audio.createGain();
      output.gain.value = .23;
      output.connect(audio.destination);
    }
    if (audio.state === "suspended" || audio.state === "interrupted") await audio.resume();
    const now = performance.now();
    if (audio.state !== "running" || now - lastStart < 45) return;
    lastStart = now;
    const profile = profiles[name] ?? profiles.wood;
    if (!samples.has(profile)) samples.set(profile, makeSample(profile));
    const source = audio.createBufferSource();
    source.buffer = samples.get(profile);
    source.connect(output);
    source.onended = () => source.disconnect();
    source.start();
  } catch {
    // Audio policy and output-device failures should leave controls usable.
  }
}

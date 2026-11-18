const hoverProfile = {
  duration: .17, strength: .58, strings: [[440, 0, .43]]
};

// Related cues use the same pentatonic pitches and a slightly different attack.
const pressProfiles = {
  wood:  { duration: .30, strength: .86, strings: [[293.66, 0, .69], [440, .038, .21]] },
  cloth: { duration: .33, strength: .78, strings: [[329.63, 0, .64], [440, .052, .22]] },
  water: { duration: .36, strength: .75, strings: [[392, 0, .60, 2], [587.33, .062, .19, -4]] },
  chime: { duration: .41, strength: .81, strings: [[293.66, 0, .57], [587.33, .055, .25]] }
};

const stringPartials = [1, .40, .22, .10, .042];
let audio;
let output;
const lastStart = { hover: -Infinity, press: -Infinity };
const samples = new Map();

function makeSample(profile) {
  const rate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.ceil(rate * profile.duration), rate);
  const channel = buffer.getChannelData(0);

  for (const [pitch, delay, volume, bend = -2] of profile.strings) {
    const offset = Math.round(delay * rate);
    for (let index = offset; index < channel.length; index += 1) {
      const time = (index - offset) / rate;
      const cycles = pitch * time + bend * time * (1 - Math.exp(-time * 12));
      let string = 0;
      stringPartials.forEach((level, partial) => {
        const harmonic = partial + 1;
        string += level * Math.sin(2 * Math.PI * cycles * harmonic) *
          Math.exp(-time * (9 + 3.2 * harmonic));
      });
      const attack = Math.min(1, time * 240);
      const touch = Math.sin(2 * Math.PI * 1270 * time) * .065 * Math.exp(-time * 118);
      channel[index] += (string * .55 + touch) * volume * attack;
    }
  }

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] *= Math.min(1, (channel.length - index - 1) / (rate * .035));
  }
  return buffer;
}

export async function playGameSound(name = "wood", interaction = "press") {
  if (name === "none") return;
  const hovering = interaction === "hover";
  try {
    if (!audio) {
      if (hovering && navigator.userActivation?.hasBeenActive === false) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = new Context();
      output = audio.createGain();
      output.gain.value = .32;
      output.connect(audio.destination);
    }
    if (!hovering && (audio.state === "suspended" || audio.state === "interrupted")) await audio.resume();
    if (audio.state !== "running") return;

    const now = performance.now();
    const type = hovering ? "hover" : "press";
    if (now - lastStart[type] < (hovering ? 55 : 32)) return;
    lastStart[type] = now;
    const profile = hovering ? hoverProfile : pressProfiles[name] ?? pressProfiles.wood;
    if (!samples.has(profile)) samples.set(profile, makeSample(profile));

    const source = audio.createBufferSource();
    const level = audio.createGain();
    source.buffer = samples.get(profile);
    level.gain.value = profile.strength;
    source.connect(level);
    level.connect(output);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
    };
    source.start();
  } catch {
    // Audio policy and output-device failures should leave controls usable.
  }
}

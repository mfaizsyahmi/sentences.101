/**
 * @typedef VOXMod
 * @prop {number} [s] start (0-100)
 * @prop {number} [e] end (0-100)
 * @prop {number} [v] volume (0-100)
 * @prop {number} [p] pitch (0-100)
 * @prop {number} [t] time compression (0-100)
 */

// https://www.russellgood.com/how-to-convert-audiobuffer-to-audio-file/
function make_download(abuffer, total_samples, name) {

	// set sample length and rate
	var duration = abuffer.duration,
		rate = abuffer.sampleRate,
		offset = 0;

	// Generate audio file and assign URL
	var new_file = URL.createObjectURL(bufferToWave(abuffer, total_samples));

	// Make it downloadable
	var download_link = document.createElement("a");
	download_link.href = new_file;
	download_link.download = name;
	download_link.click();
}

// Convert an AudioBuffer to a Blob using WAVE representation
function bufferToWave(abuffer, len) {
	var numOfChan = abuffer.numberOfChannels,
		length = len * numOfChan * 2 + 44,
		buffer = new ArrayBuffer(length),
		view = new DataView(buffer),
		channels = [], i, sample,
		offset = 0,
		pos = 0;
  
	// write WAVE header
	setUint32(0x46464952);                         // "RIFF"
	setUint32(length - 8);                         // file length - 8
	setUint32(0x45564157);                         // "WAVE"
  
	setUint32(0x20746d66);                         // "fmt " chunk
	setUint32(16);                                 // length = 16
	setUint16(1);                                  // PCM (uncompressed)
	setUint16(numOfChan);
	setUint32(abuffer.sampleRate);
	setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
	setUint16(numOfChan * 2);                      // block-align
	setUint16(16);                                 // 16-bit (hardcoded in this demo)
  
	setUint32(0x61746164);                         // "data" - chunk
	setUint32(length - pos - 4);                   // chunk length
  
	// write interleaved data
	for(i = 0; i < abuffer.numberOfChannels; i++)
	  channels.push(abuffer.getChannelData(i));
  
	while (pos < length) {
	  for(i = 0; i < numOfChan; i++) {             // interleave channels
		sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
		sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
		view.setInt16(pos, sample, true);          // write 16-bit sample
		pos += 2;
	  }
	  offset++                                     // next source sample
	}
  
	// create Blob
	return new Blob([buffer], {type: "audio/wav"});
  
	function setUint16(data) {
	  view.setUint16(pos, data, true);
	  pos += 2;
	}
  
	function setUint32(data) {
	  view.setUint32(pos, data, true);
	  pos += 4;
	}
  }
  

/**
 * Wrapper for AudioBuffer.
 * Allows you to get buffered audio with VOX modifiers applied.
 * 
 * NOTE: Only start/end/time mods are applied to audiobuffers. 
 *       Pitch is applied to getSourceNode. Volume has to be applied at the gain node.
 */
class BufferedAudio {
	BASEMOD = ""
	/**
	 * @param {AudioContext} ctx 
	 * @param {AudioBuffer} buf 
	 */
	constructor(ctx, buf) {
		/**
		 * @type {AudioContext}
		 */
		this.ctx = ctx;
		/**
		 * @type {Map<string,AudioBuffer>}
		 */
		this.bufMap = new Map();
		this.bufMap.set("",  buf);
		
		return this;
	}
	
	/**
	 * creates and returns an AudioBuffer with VODMod applied
	 * @param {VOXMod} mod modifier to apply
	 * @returns {AudioBuffer} AudioBuffer with VODMod applied
	 * @private
	 */
	_newModdedBuffer(mod) {
		const modSpec = VOXSpeaker.parseMod(mod, VOXSpeaker.defaultMod),
		buf = this.bufMap.get(""),
		/*
			time compression works like this:
			sample is divided into 8 chunks
			first chunk is always full (probably a coding quirk)
			every other chunk has n% of the start lopped off
			
			if sample is truncated at the ends, then the remainder is chunked.
		*/
		chunkOffset = Math.round(modSpec.s / 100 * buf.length),
		chunkSize = Math.floor((modSpec.e - modSpec.s) / 100 / 8 * buf.length),
		targetLength = chunkSize * (((100 - modSpec.t)/100) * 7 + 1),
		newbuf = new AudioBuffer({
			length : Math.ceil(targetLength),
			numberOfChannels : buf.numberOfChannels,
			sampleRate : buf.sampleRate
		});
		
		for (let ch=0; ch < buf.numberOfChannels; ch++) {
			let srcArr = buf.getChannelData(ch),
			targetArr = new Float32Array(newbuf.length),
			targetArrOffset = 0;
			
			// copies the src to target in 8 chunks (to apply time compression)
			for (let n = 0; n < 8; n++) {
				let thisOffset = !n
					? chunkOffset
					: chunkOffset + n * chunkSize + Math.floor(modSpec.t / 100 * chunkSize),
				thisLength = !n
					? chunkSize
					: Math.floor((100 - modSpec.t) / 100 * chunkSize),
					
				chunk = srcArr.slice(thisOffset, thisOffset + thisLength)
				
				targetArr.set(chunk, targetArrOffset);
				targetArrOffset += chunk.length;
			}
			
			newbuf.copyToChannel(targetArr, ch);
		}
		
		return newbuf;
	}
	
	/**
	 * returns an AudioBuffer with VODMod applied
	 * @param {VOXMod|string} [mod] modifier to apply
	 * @returns {AudioBuffer} AudioBuffer with VODMod applied
	 * @public
	 */
	getBuffer(mod = "") {
		if (mod instanceof Object)
			mod = VOXSpeaker.modToString(mod);
		if (!this.bufMap.has(mod)) {
			this.bufMap.set(mod, this._newModdedBuffer(mod));
		}
		
		return this.bufMap.get(mod);
	}
	
	/**
	 * returns an AudioBufferSourceNode with VODMod applied
	 * @param {VOXMod|string} [mod] modifier to apply
	 * @returns {AudioBufferSourceNode} AudioBufferSourceNode with VODMod applied
	 * @public
	 */
	getSourceNode(mod = "") {
		const modSpec = VOXSpeaker.parseMod(mod, VOXSpeaker.defaultMod);
		return new AudioBufferSourceNode(this.ctx, {
			buffer: this.getBuffer(mod),
			playbackRate: modSpec.p / 100
		});
	}
}

class VOXSpeaker extends EventTarget {
	
	//sentences.txt parser 
	static parseRE = /(?<path>\w+\/)|(?<name>\w+!?|\.|,)(?:\((?<mod1>.*?)\))?|\((?<modall>.*?)\)/dg;
	
	constructor(options) {
		// calls EventTarget's constructor
		super();
		/**
		 * @type {AudioContext}
		 */
		this.ctx = new AudioContext();
		/**
		 * @type {GainNode}
		 */
		this.gainNode = this.ctx.createGain(); // modulated by the sentence
		/**
		 * @type {GainNode}
		 */
		this.masterVolumeNode = this.ctx.createGain(); // master volume
		this.gainNode.connect(this.masterVolumeNode);
		this.masterVolumeNode.connect(this.ctx.destination);
		
		/**
		 * @type {Map<string, BufferedAudio>}
		 */
		this.audioMap = new Map();
		/**
		 * @type {String[]}
		 */
		this._soundPaths = ["valve_sound/"];
		
		this.status = "ready";
	}
	
	get volume() {
		return this.masterVolumeNode.gain.value * 100;
	}
	set volume(val) {
		this.masterVolumeNode.gain.value = val / 100;
		this.dispatchEvent(new Event("volumechange"));
	}
	
	get soundPaths() {
		return this._soundPaths;
	}
	set soundPaths(val) {
		if (!val instanceof Array)
			throw new TypeError('Value must be an array.')
		this._soundPaths = val
	}
	
	get status() {
		return this._status;
	}
	set status(val) {
		if (this._status === val) return;
		
		this._status = val;
		this.dispatchEvent(new Event(val));
	}
	
	/**
	 * @returns {VOXMod} default mod object
	 */
	static get defaultMod() {
		return {s:0, e:100, t:0, p:100, v:100}
	}
	
	/**
	 * parses a VOD mod string into a mod object
	 * @param {string} input 
	 * @param {VOXMod} [baseObj]
	 * @returns {VOXMod} 
	 */
	static parseMod(input, baseObj = {}) {
		const result = Object.assign({}, baseObj);
		if (input instanceof Object) {
			return Object.assign(baseObj, input);
		}
		
		input.match(/\w\d+(?:\s|$)/ig)?.forEach(part => {
			result[part.match(/\w/)] = parseInt(part.match(/\d+/));
		});
		
		return result;
	}

	/**
	 * Converts VOXMod object to mod string. 
	 * Values matching base will be dropped.
	 * @param {VOXMod} mod 
	 * @param {VOXMod} [base] base Vox mod values
	 * @returns {string} mod string
	 */
	static modToString(mod, base = VOXSpeaker.defaultMod) {
		return Object.entries(mod)
		.filter(kv => base[kv[0]] !== kv[1])
		.map(kv => kv.join(""))
		.join(" ")
	}
	
	/**
	 * loads a sound file
	 * @param {string} path path from sound folder (searched in this.soundPaths)
	 * @returns {BufferedAudio|undefined} BufferedAudio if loaded, else undefined
	 */
	async loadToBuffer(path) {
		if (this.audioMap.has(path.toLowerCase())) return;
		const srcList = this.soundPaths.map(soundPath => new URL(soundPath + path + ".wav", location));
		
		let wavFile = null;
		while (!wavFile?.ok && srcList.length) {
			wavFile = await fetch(srcList.shift());
		}
		if (!wavFile.ok) {
			console.log("couldn't load " + path);
			return;
		}
		
		const wavBuf  = await wavFile.arrayBuffer();
		const audBuf  = await this.ctx.decodeAudioData(wavBuf);
		
		this.audioMap.set(
			path.toLowerCase(), 
			new BufferedAudio(this.ctx, audBuf)
		);
		
		return this.audioMap.get(path.toLowerCase());
	}

	/** Clears the audio cache */
	clearAudioCache() {
		this.audioMap.clear();
	}

	/**
	 * parses a sentence string into match groups, and nothing more
	 * @param {string} sentence sentence string to parse
	 * @returns {RegExpExecArray[]} regex matches
	 */	
	static parseSentenceRaw(sentence) {
		// parse the sentence into parts
		const parts = [];
		let m;
		while (m = VOXSpeaker.parseRE.exec(sentence)) {
			parts.push(m);
		}
		
		return parts;
	}

	/**
	 * @typedef wordListItem
	 * @prop {string} name 
	 * @prop {VOXMod} mod
	 */
	/**
	 * @typedef parseSentenceReturnObject
	 * @prop {RegExpExecArray[]} parts raw RegExp match object
	 * @prop {wordListItem[]} wordList 
	 */
	/**
	 * parses a sentence string
	 * @param {string} sentence sentence string to parse
	 * @returns {parseSentenceReturnObject}
	 */
	parseSentence(sentence)	{
		const parts = VOXSpeaker.parseSentenceRaw(sentence);
		
		const wordList = [];
		let path = "vox/", // default path
		nameMap = {",": "_comma", ".": "_period"}, 
		thisMatch,
		thisName,
		mod = {s:0, e:100, t:0, p:100, v:100}; // default modifier setting
		
		// loops through the matches to set sentence paths, modifiers, etc.
		for (let i = 0; i < parts.length; i++) {
			thisMatch = parts[i].groups;
			if (thisMatch.path) {
				path = thisMatch.path;
				continue;
				
			} else if (thisMatch.modall) {
				mod = VOXSpeaker.parseMod(thisMatch.modall, mod);
				continue;
				
			} else if (!thisMatch.name) {
				// no name, dunno what we're dealing with here
				continue;
			}
			
			thisName = nameMap.hasOwnProperty(thisMatch.name)
				? nameMap[thisMatch.name].toLowerCase()
				: thisMatch.name.toLowerCase();
			
			wordList.push({
				name: path + thisName,
				mod: thisMatch.mod1 
					? VOXSpeaker.parseMod(thisMatch.mod1, mod)
					: mod
			});
		}

		return { parts, wordList }
	}

	/**
	 * Speak a given sentence
	 * @param {string} sentence 
	 */
	async speak(sentence) {
		this.stop();
		
		const { wordList } = this.parseSentence(sentence);
		const soundsToLoad = [];
		wordList.forEach(item => {
			if (!this.audioMap.has(item.name)) {
				soundsToLoad.push(item.name);
			}
		})

		// load the sounds
		if (soundsToLoad.length) {
			this.status = "medialoading";
			await Promise.allSettled(soundsToLoad.map(path => this.loadToBuffer(path)))
		}
		this.status = 'medialoaded';
		this.status = 'ready';
		
		// prepares the array of nodes
		const audioList = wordList.map(item => { return {
			obj : this.audioMap.get(item.name),
			node : this.audioMap.get(item.name)?.getSourceNode(item.mod) ?? null,
			vol : item.mod.v / 100 // for gainNode
		}});
		audioList.forEach((item, i, arr) => {
			item.node?.connect(this.gainNode);
			item.node?.addEventListener("ended", _ => this.playNextWord(arr));
		});
		
		this.audioList = audioList;
		
		this.status = "speakstart"; // set status, which will dispatch event
		this.playNextWord(this.audioList);
	}
	
	/**
	 * Plays the next word in audioList.
	 * @param {Object[]} audioList 
	 * @private
	 */
	playNextWord(audioList = this.audioList) {
		if (!audioList.length) {
			this.gainNode.gain.value = 1;
			this.status = "speakend";
			this.status = "ready";
			return;
		}
		
		let newItem = audioList.shift();
		this.gainNode.gain.value = newItem.vol;
		newItem.node?.start();
		/**
		 * @type {AudioBufferSourceNode}
		 */
		this.currentAudioNode = newItem.node;
	}
	
	/**
	 * plays a sound
	 * @param {string} name path to sound
	 */
	async play(name) {
		if (!this.audioMap.has(name))
			await this.loadToBuffer(name);
		
		const node = this.audioMap.get(name)?.getSourceNode();
		node.connect(this.ctx.destination);
		node.start();
	}
	
	/**
	 * Stops currently playing sentence
	 */
	stop() {
		this.audioList?.splice(0, this.audioList.length);
		this.currentAudioNode?.stop();
		this.gainNode.gain.value = 1;
	}
}

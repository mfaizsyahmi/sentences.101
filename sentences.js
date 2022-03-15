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
	 * @param {AudioContext|OfflineAudioContext} [ctx] audio context to use
	 * @returns {AudioBufferSourceNode} AudioBufferSourceNode with VODMod applied
	 * @public
	 */
	getSourceNode(mod = "", ctx = this.ctx) {
		const modSpec = VOXSpeaker.parseMod(mod, VOXSpeaker.defaultMod);
		return new AudioBufferSourceNode(ctx, {
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
		const srcList = this.soundPaths
		.map(soundPath => new URL(soundPath + path + ".wav", location));
		
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
	 * @returns {parseSentenceReturnObject} object with match array and word list
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
	 * make sure all the words are loaded
	 * @param {wordListItem[]} wordList 
	 */
	async preloadSounds(wordList) {
		const soundsToLoad = [];
		wordList.forEach(item => {
			if (!this.audioMap.has(item.name)) {
				soundsToLoad.push(item.name);
			}
		})

		// load the sounds
		if (soundsToLoad.length) {
			this.status = "medialoading";
			await Promise.allSettled(soundsToLoad
				.map(path => this.loadToBuffer(path))
			)
		}
		this.status = 'medialoaded';
	}

	/**
	 * @typedef audioListItem
	 * @prop {BufferedAudio} obj BufferedAudio object
	 * @prop {VOXMod} mod modifier for this audio bit
	 * @prop {BaseAudioContext} ctx context to use to create the source node
	 * @prop {AudioBufferSourceNode} node source node that emits the sound. 
	 *                                    controls pitch (i.e. playback rate)
	 * @prop {GainNode} gain gainNode to control volume. source node connects to this.
	 * @prop {number} offset time offset for the source node 
	 * @prop {AudioNode} [connectTarget] if given, the audio chain connects to this 
	 *                                   instead of ctx.destination
	 */
	/**
	 * Prepares an audioList out of the wordList
	 * (incl. connecting source nodes and events)
	 * @param {wordListItem[]} wordList 
	 * @param {Object} [options]
	 * @param {BaseAudioContext} [options.ctx] audio context to use
	 * @param {AudioNode} [options.connectTarget] the node chain connect to this
	 * @returns {audioListItem[]}
	 */
	makeAudioList(wordList, options = {}) {
		const settings = Object.assign({
			//ctx: this.ctx,
			//gainNode: this.gainNode
		}, options);

		const audioList = wordList.map(item => { return {
			obj : this.audioMap.get(item.name),
			mod: item.mod, // for NOD
			ctx: settings.ctx, // for NOD
			connectTarget: settings.connectTarget,
			// node is to be created on demand
			get node() {
				if (!this._node && this.obj && this.ctx) {
					this._node = this.obj
						.getSourceNode(this.mod, this.ctx) ?? null;
				};
				if (this.gain)
					this._node?.connect(this.gain)

				return this._node;
			},
			_gain: settings.gainNode, 
			get gain() {
				if (!this._gain && this.ctx) {
					this._gain = this.ctx.createGain();
					this._gain.gain.value = this.mod.v / 100;
					this._gain.connect(
						this.connectTarget ?? this.ctx.destination
					);
				}

				return this._gain;
			}
		}});

		if (!audioList.every(item => item.obj))
			throw "Couldn't load all sounds"

		return audioList;
	}

	/**
	 * Speak a given sentence
	 * @param {string} sentence 
	 */
	async speak(sentence) {
		this.stop();
		
		const { wordList } = this.parseSentence(sentence);
		
		// preload all sounds
		await this.preloadSounds(wordList);

		this.status = 'ready';
		
		// prepare the audioList
		this.audioList = this.makeAudioList(wordList, {
			ctx: this.ctx,
			gainNode: this.gainNode,
		});
		
		/*
		this.status = "speakstart"; // set status, which will dispatch event
		this.playNextWord(this.audioList);
		*/
		this.playAudioList(this.audioList)
		.then(_=> delete this.audioList)
	}

	/**
	 * record the sentence to an offline context
	 * @param {string} sentence 
	 * @param {Object} [options]
	 * @param {number} [options.sampleRate = 22050]
	 * @returns {AudioBuffer} the recorded speech
	 */
	async recordSpeech(sentence, options = {}) {
		const { wordList } = this.parseSentence(sentence),
		settings = Object.assign({
			sampleRate : 22050
		}, options);
		
		// preload all sounds
		await this.preloadSounds(wordList);

		// from wordList, extract audio buffer, pitch, and vol
		const audioList = wordList.map(wordItem => { return [
			this.audioMap.get(wordItem.name).getBuffer(wordItem.mod),
			wordItem.mod.p / 100,
			wordItem.mod.v / 100
		]})
		// then construct entire offlineaudiocontext graphs for each buffer
		.map(([buffer, rate, vol]) => { return {
			ctx: new OfflineAudioContext(
				1, 
				Math.ceil(buffer.duration / rate * settings.sampleRate), 
				settings.sampleRate
			),
			get gain() {
				const gain = this.ctx.createGain();
				gain.connect(this.ctx.destination);
				gain.gain.value = vol;
				return gain;
			},
			get node() {
				const node = new AudioBufferSourceNode(this.ctx, {
					buffer,
					playbackRate: rate
				});
				node.connect(this.gain);
				return node;
			}
		}})
		
		// start the source nodes now (i.e. press play)
		audioList.forEach(item => item.node.start());

		// press record on all the offline contexts
		// and get the rendered buffers
		const jobDone = await Promise
		.allSettled(audioList.map(async item => {
			return await item.ctx.startRendering()
		})),
		renderedBuffers = jobDone.map(thing => thing.value);

		// prepare the final buffer
		const totalLength = renderedBuffers.reduce((cum, buf) => cum + buf.length, 0),
		combinedBuffer = new AudioBuffer({
			numberOfChannels: 1,
			length: totalLength,
			sampleRate: settings.sampleRate
		}),
		bufArr = combinedBuffer.getChannelData(0);
		
		// copies all the buffer into the final one
		renderedBuffers.reduce((offset, buf) => {
			bufArr.set(buf.getChannelData(0), offset);
			return offset + buf.length;
		}, 0);

		return combinedBuffer;
	}

	async downloadSpeech(sentence) {
		// record the speech
		const recorded = await this.recordSpeech(sentence),
		timestamp = new Date( Date.now() ).toISOString()
			.replace("T","_").replaceAll(":","-").replace(/\.\d+/,""),
		name = `sentences.101 recording ${timestamp}.wav`;

		make_download(recorded, recorded.length, name);
	}
	
	/**
	 * plays the given audioList
	 * @param {audioListItem[]} audioList 
	 * @param {boolean} [online=true] whether the audio is playing on normal or 
	 *                                offline audio context. used to update status.
	 */
	playAudioList(audioList, online = true) {
		// set the offsets for every sound
		// also gets the total duration
		const totalDuration = audioList.reduce((offset, cur) => {
			cur.offset = offset;
			return offset + (cur.node.buffer.duration / cur.node.playbackRate.value);
		}, 0);

		// update status
		this.status = online ? "speakstart" : "renderstart"
		
		// start every source nodes at their time offsets
		audioList.forEach(item => {
			item.node.start(item.ctx.currentTime + item.offset)
		});

		return new Promise((resolve, _) => {
			// update status at the end of things
			const endUpdate = () => {
				this.status = online ? "speakend" : "renderend";
				resolve()
			};
			audioList[audioList.length - 1].node.onended = endUpdate;
			setTimeout(_ => endUpdate(), totalDuration * 1000); // backup
		})
	}

	/**
	 * Plays the next word in audioList.
	 * @param {Object[]} [audioList = this.audioList] audioList to work on
	 * @param {GainNode} [gainNode = this.gainNode] gainNode to reset volume after finished
	 * @private
	 */
	playNextWord(audioList = this.audioList, gainNode = this.gainNode) {
		if (!audioList.length) {
			if (gainNode)
				gainNode.gain.value = 1;
			this.status = "speakend";
			this.status = "ready";
			return;
		}
		
		/**
		 * @type {audioListItem}
		 */
		let newItem = audioList.shift();
		if (newItem.gain)
			newItem.gain.gain.value = newItem.vol;
		newItem.node?.start();
		/**
		 * @type {AudioBufferSourceNode}
		 */
		this.currentAudioNode = newItem.node;
	}
	
	/**
	 * plays a sound
	 * @param {string} name path to sound
	 * @returns {AudioBufferSourceNode} the playing source node, so you can stop it later
	 */
	async play(name) {
		if (!this.audioMap.has(name))
			this.loadToBuffer(name);
		
		const node = this.audioMap.get(name)?.getSourceNode();
		node.connect(this.ctx.destination);
		node.start();

		return node;
	}
	
	/**
	 * Stops currently playing sentence
	 * @param {audioListItem[]} audioList the playing audioList. defaults to this.audioList
	 */
	stop(audioList = this.audioList) {
		if (!audioList) return;

		audioList.forEach(item => {
			try {
				item.node?.stop()
			} catch(e) {
				// do nothing
			}
		});
		if (audioList === this.audioList)
			delete this.audioList;
		/*
		this.audioList?.splice(0, this.audioList.length);
		this.currentAudioNode?.stop();
		this.gainNode.gain.value = 1;
		*/
	}
}

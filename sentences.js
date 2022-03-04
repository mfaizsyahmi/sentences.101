class BufferedAudio {
	
	constructor(ctx, buf) {
		this.ctx = ctx;
		this.bufMap = new Map();
		this.bufMap.set("",  buf);
		
		return this;
	}
	
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
	
	getBuffer(mod = "") {
		if (mod instanceof Object)
			mod = VOXSpeaker.modToString(mod);
		if (!this.bufMap.has(mod)) {
			this.bufMap.set(mod, this._newModdedBuffer(mod));
		}
		
		return this.bufMap.get(mod);
	}
	
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
	parseRE = /(?<path>\w+\/)|(?<name>\w+!?|\.|,)(?:\((?<mod1>.*?)\))?|\((?<modall>.*?)\)/g;
	
	constructor(options) {
		super();
		this.ctx = new AudioContext();
		this.gainNode = this.ctx.createGain(); // modulated by the sentence
		this.masterVolumeNode = this.ctx.createGain(); // master volume
		this.gainNode.connect(this.masterVolumeNode);
		this.masterVolumeNode.connect(this.ctx.destination);
		
		this.audioMap = new Map();
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
	
	static get defaultMod() {
		return {s:0, e:100, t:0, p:100, v:100}
	}
	
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
	// values matching base will be dropped
	static modToString(mod, base = VOXSpeaker.defaultMod) {
		return Object.entries(mod)
		.filter(kv => base[kv[0]] !== kv[1])
		.map(kv => kv.join(""))
		.join(" ")
	}
	
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
	clearAudioCache() {
		this.audioMap.clear();
	}
	
	parseSentence(sentence)	{
		// parse the sentence into parts
		const parts = [];
		let m;
		while (m = this.parseRE.exec(sentence)) {
			parts.push(m);
		}
		
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
		this.currentAudioNode = newItem.node;
	}
	
	async play(name) {
		if (!this.audioMap.has(name))
			await this.loadToBuffer(name);
		
		const node = this.audioMap.get(name)?.getSourceNode();
		node.connect(this.ctx.destination);
		node.start();
	}
	
	stop() {
		this.audioList?.splice(0, this.audioList.length);
		this.currentAudioNode?.stop();
		this.gainNode.gain.value = 1;
	}
}

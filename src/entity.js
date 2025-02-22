'use strict'
const TYPES = {}

// convert each enum descriptor in ABOUT.details.codes
// from [value]→name to [name]→value
const CODES = {__proto__:null}
for (let [type, map] of Object.entries(ABOUT.details.codes)) {
	let z = CODES[type] = {__proto__:null}
	for (let [num, name] of Object.entries(map)) {
		z[name] = +num
		// for backwards compatibility:
		/*if (name in CODES && CODES[name]!=+num)
			console.info('enum collision')
		CODES[name] = +num*/
	}
}
Object.freeze(CODES)

class FileMeta {
	constructor(content, user) {
		let meta = content.meta ? JSON.parse(content.meta) : {}
		this.width = meta.width
		this.height = meta.height
		this.size = meta.size
		this.quantize = meta.quantize
		
		this.createUser = user
		
		this.name 
	}
}

// todo: permissions class? idk

// this isn't really just "author", so much as um,
// extra data to use when rendering a comment
class Author {
	constructor(message, user, content) {
		let valid = x => x && ('string'==typeof x || 'number'==typeof x)
		let {a, big, b, n=b, apx} = message.values
		if (user) {
			this.username = user.username
			this.bridge = user.id==5410 && user.username=="sbs_discord_bridge"
			this.avatar = valid(a) ? String(a) : user.avatar
		}
		this.nickname = valid(n) ? Author.filter_nickname(n) : null
		this.bigAvatar = valid(big) ? String(big) : null
		this.avatar_pixel = apx ?? false
		this.merge_hash = `${message.module||""},${message.contentId},${message.createUserId},${this.avatar},${this.bigAvatar||""},${this.avatar_pixel||""},${this.username} ${this.nickname||""}`
		this.date = new Date(message.createDate)
		if (content)
			this.page_name = content.name2
	}
	static filter_nickname(name) {
		return String(name).substring(0, 50).replace(/\n/g, "  ")
	}
}
Object.assign(Author.prototype, {
	username: "missingno.",
	avatar: "0",
	nickname: null,
	bridge: false,
	bigAvatar: null,
	avatar_pixel: false,
	merge_hash: "0,0,0,0,,missingno. ",
	page_name: "somewhere?",
	date: new Date(NaN),
	//			content_name: "", todo, store page title, for listing in sidebar?
})

// TODO: improve class structure:

// TYPES[thing]:
// .init(obj) -> instance
// .new() -> create new, with default values
// .fields[name] -> info about field, incl default value
// .prototype -> used for the prototype of instances
// some way of extracting/setting all writable fields? (for the editor)

// so like, you'd do, for editing:
// - download data
// - call TYPES[type].init(obj)
// - get a list of writable fields and let the user edit
// - put the new values back into the original object
// - 

let BaseEntity = function BaseEntity() {}
BaseEntity.prototype = Object.create(STRICT, {
	// conversions
	[Symbol.toPrimitive]: {value: NO_CONVERT},
	Blob: {
		value() {
			return new Blob([JSON.stringify(this)], {type:"application/json;charset=UTF-8"})
		}
	},
	[Symbol.toStringTag]: {
		get() { return "qcs:"+this.Type }
	},
})

for (let name in ABOUT.details.types) {
	let proto_desc = {
		constructor: null,
		Type: {value: name},
		toJSON: {}, // JSON.stringify() etc.
		then: {}, // promises
	}
	if (name == 'message') {
		proto_desc.Author = {
			value: Object.freeze(Object.create(Author.prototype)),
			writable: true,
		}
		proto_desc.LinkedUsers = {
			value: Object.freeze([]),
			writable: true,
		}
	}
	if (name == 'watch') {
		// FIXME: this could possibly happen before it's defined
		proto_desc.Message = {
			value: Object.freeze(Object.create(TYPES['message'].prototype)),
			writable: true,
		}
	}
	// hhh
	if (name == 'content') {
		proto_desc.Meta = {
			value: null,
			writable: true,
		}
	}
	let fields = ABOUT.details.types[name]
	let defaults = ABOUT.details.objects[name]
	for (let key in fields) {
		let field = fields[key]
		proto_desc[key] = {
			enumerable: true, writable: true,
			value: Object.freeze(defaults[key]),
		}
		if (field.type=='datetime')
			proto_desc[key+"2"] = {get() {
				let d = this[key]
				return d ? new Date(d) : null
			}}
	}
	// hhhh
	// TODO: just have one function to get a readable title for
	// any entity type (particularly: user/content)
	if (name=='content') {
		proto_desc.name2 = {get() {
			let n = this.name
			if (this.contentType == CODES.InternalContentType.file) {
				// "image.<extension>" - from clipboard
				// GUID(?) - iOS file upload
				if (n=="" || /^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}|^image\.[a-z]{3,4}/.test(n))
					n = "untitled:"+(this.hash||this.id)
			}
			return n
		}}
	}
	/*if (name=='user') {
		proto_desc.name2 = {get() {
			return this.username
		}}
	}*/
	let proto
	let cons = (o)=>{
		return Object.setPrototypeOf(o, proto)
	}
	//Object.setPrototypeOf(cons, BaseEntity)
	proto_desc.constructor = {value: cons}
	proto = Object.create(BaseEntity.prototype, proto_desc)
	Object.defineProperties(cons, {
		name: {value: "qcs:"+name},
		prototype: {value: proto},
	})
	TYPES[name] = cons
}
// change all the maps to be bidirectional
// ex: {'0':'none', '1':'page', none:0, page:1}
for (let enm in ABOUT.details.codes) {
	let map = ABOUT.details.codes[enm]
	for (let code in map) {
		map[map[code]] = code
		map.MAX = code
	}
}

// functions for processing recieved entities/
// DATA PROCESSOR
const Entity = NAMESPACE({
	// official page types
	CONTENT_TYPES: [
		'resource', 'chat', 'program', 'tutorial', 'documentation',
	],
	has_perm(perms, uid, perm) {
		if (uid!=0 && perms[0] && perms[0].includes(perm))
			return true
		return perms[uid] && perms[uid].includes(perm)
	},
	user_has_perm(perms, user, perm) {
		if (user.groups) {
			for(let group of user.groups) {
				if (this.has_perm(perms, group, perm))
					return true
			}
		}
		return this.has_perm(perms, user.id, perm)
	},
	
	// should this return null?
	// I'm not sure how this should work exactly
	// maybe just split on non-digits really
	parse_numbers(x) {
		if (x==null || x=="")
			return null
		return x.split(/[, ]+/).filter(x=>/^\d+$/.test(x)).map(x=>+x)
	},
	
	do_listmapmap(listmapmap) {
		for (let name in listmapmap)
			this.do_listmap(listmapmap[name])
		return listmapmap
	},
	
	do_listmap(listmap) {
		for (let name in listmap)
			this.do_list(listmap[name], name)
		if (listmap.message && listmap.user)
			this.link_comments(listmap)
		return listmap
	},
	
	// TODO: yeah this makes the console.log messages harder to read too. gosh. we should check how often the values are used. and if a linear search is more suitable?
	do_list(list, name) {
		// todo: better system for mapping types
		let type = list.Type || this.key_type(name)
		let cons = TYPES[type] || (x=>x) // fallback (bad)
		
		// todo: this is probably unnessesary most of the time
		// and might be slow etc. (esp for lots of messages)
		// maybe we should only create these maps when needed?
		// like, when getting data for a page, for example
		// there's like, 10 users total,
		// definitely faster to just search the list than create this map
		for (let entity of list)
			list[~entity.id] = cons(entity)
		// using ~ on the id will map 0 → -1, 1 → -2, 2 → -3 etc.
		// this avoids nonnegative integer keys,
		// since the order of those isn't preserved,
		return list
	},
	
	// link user data with comments
	link_comments({message, user, content}) {
		for (let m of message) {
			m.Author = new Author(m, user[~m.createUserId], content?.[~m.contentId])
			m.LinkedUsers = m.uidsInText.map(uid => user[~uid]).filter(v => v)
		}
	},
	
	fake_category(id) {
		return TYPES.content({
			name: id===0 ? "Root" : 'category:'+id,
			contentType: 1,
			literalType: 'category',
			id: id,
			hash: 'FAKE',
			permissions: id===0 ? {'0':'CR'} : {},
		})
	},
	
	link_watch({message, watch, content}) {
		for (let w of watch) {
			let c = content[~w.contentId]
			if (!c) continue
			let m = message[~c.lastCommentId]
			if (!m) continue
			w.Message = m
		}
	},
	
	key_type(key) {
		return {
			A: 'activity',
			U: 'user',
			C: 'content',
			M: 'message',
			G: 'message_aggregate', // ran out of letters
		}[key[0]] || key
	},
	
	is_new_comment(c) {
		return !c.deleted && !c.edited
	},
	
	ascending(list, field='id') {
		if (list.length>1 && list[0][field] > list[1][field]) {
			list.reverse()
			return true
		}
	},
})

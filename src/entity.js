const TYPES = {}

for (let type_name in ABOUT.details.types) {
	let field_datas = ABOUT.details.types[type_name]
	let field_defaults = ABOUT.details.objects[type_name]
	let writables = {}
	let proto = {
		toJSON: {}, //idea: keep track of whether an object was requested with fields=*, and prevent posting it otherwise
		then: {},
		Type: {value: type_name},
		Fields: {value: field_datas},
		// temp: 
		name: {get() { return this.username }},
	}
	if (type_name == 'message') {
		proto.Author = {value: Object.freeze({
			avatar: "0",
			bigAvatar: null,
			realname: "",
			nickname: "",
			username: "",
		})}
	}
	for (let field_name in field_datas) {
		let field_data = field_datas[field_name]
		let field_default = field_defaults[field_name]
		proto[field_name] = {value: field_default, enumerable: true}
		if (field_data.type=='datetime')
			proto[field_name+"2"] = {get(){
				let d = this[field_name]
				return d ? new Date(d) : null
			}}
	}
	proto = Object.create(STRICT, proto)
	let cons = (o=~E)=>{
		Object.setPrototypeOf(o, proto)
		return o
	}
	TYPES[type_name] = cons
}

ABOUT = null

function map_user(obj, prop, users) {
	let user = users[obj[prop+"Id"]]
	obj[prop] = user || null
}
function map_date(obj, prop) {
	if (obj[prop])
		obj[prop] = new Date(obj[prop])
}

//class Emap

// functions for processing recieved entities/
// DATA PROCESSOR
let Entity = (()=>{"use strict"; return singleton({
	
/*	onCategoryUpdate(cats) {
		Sidebar.redraw_category_tree(cats)
	},
	
	category_map: {0: {
		name: "[root]",
		id: 0,
		Type: 'category',
		description: "",
		values: {}
	}},
	got_new_category: false,*/
	
	// official page types
	CONTENT_TYPES: [
		'resource', 'chat', 'program', 'tutorial', 'documentation', 'userpage'
	],
	// I don't like the way the iterator works here...
/*	safe_map(map, fake) {
		// `fake` accessed as nonlocal
		return new Proxy(map, {
			get(map, id) {
				if (id == Symbol.iterator) {
					let e = Object.entries(map)
					return e[Symbol.iterator].bind(e)
				}
				return map[id] || fake(+id, map)
			},
			has(map, id) {
				return map[id]!=undefined
			},
		})
	},
	
,*/
	has_perm(perms, uid, perm) {
		return perms && perms[uid] && perms[uid].includes(perm)
	},
	
	comment_merge_hash(comment) {
		let user = comment.createUser || {}
		return `${comment.contentId},${comment.createUserId},${user.avatar},${user.bigAvatar||""},${user.username} ${user.nickname || ""}`
	},
	
	filter_nickname(name) {
		return String(name).substr(0,50).replace(/\n/g, "  ")
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
		Object.for(listmapmap, (listmap) => this.do_listmap(listmap))
	},
	
	do_listmap(listmap) {
		Object.for(listmap, (list, name) => this.do_list(list, name))
	},
	
	do_list(list, name) {
		let type = this.key_type(name)
		let cons = TYPES[type]
		for (let entity of list)
			list[~entity.id] = cons(entity)
		// using ~ on the id will map 0 → -1, 1 → -2, 2 → -3 etc.
		// this avoids nonnegative integer keys,
		// since the order of those isn't preserved,
	},
	
	// link user data with comments
	link_comments({message:messages, user:users}) {
		for (let message of messages) {
			let user = users[~message.createUserId]
			if (!user)
				continue
			message.Author = {
				bigAvatar: message.values.big,
				username: user.username,
			}
			
			let av = data.values.a
			if (av && ('string'==typeof av || 'number'==typeof av))
				message.Author.avatar = av
			else
				message.Author.avatar = user.avatar
			
			let ab = data.values.big
			if (ab && ('string'==typeof ab || 'number'==typeof ab))
				message.Author.bigAvatar = ab
			
			// == name ==
			message.Author.username = user.username
			let nick = null
			// message from discord bridge
			let bridge = 'string'==typeof message.values.b
			if (bridge)
				nick = message.values.b
			// regular nickname
			if ('string'==typeof message.values.n)
				nick = message.values.n
			
			if (nick != null) {
				nick = this.filter_nickname(nick)
				if (bridge)
					message.Author.username = nick
				message.Author.nick = nick
				message.Author.realname = user.username
			}
			
			// we need:
			// - avatar
			// - bigavatar
			// - realname (usually = username, except for bridge messages)
			// - nickname
			// - username
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
	
	// editUserId -> editUser
	// createUserId -> createUser
	// editDate
	// createDate
	// TODO: instead of this silly user modifying thing, just render the damn message directly, based on its own data
/*	process_comment_user_meta(data) {
		let override = {}
		// avatar override
		if (+data.meta.a)
			override.avatar = {value: +data.meta.a}
		if (+data.meta.big)
			override.bigAvatar = {value: +data.meta.big}
		// nicknames
		let nick = null
		let bridge = null
		if (typeof data.meta.b == 'string') {
			nick = data.meta.b
			bridge = nick
			// strip bridge nickname from old discord messages
			if (data.meta.m=='12y' && data.content.substr(0, nick.length+3) == "<"+nick+"> ")
				data.content = data.content.substring(nick.length+3, data.content.length)
		}
		if (typeof data.meta.n == 'string')
			nick = data.meta.n
		if (nick != undefined) {
			override.nickname = {value: this.filter_nickname(nick)}
			override.realname = {value: data.createUser.name}
			// if the bridge name is set, we set the actual .name property to that, so it will render as the true name in places where nicknames aren't handled (i.e. in the sidebar)
			// and it's kinda dangerous that .b property is trusted so much..
			if (bridge != undefined)
				override.name = {value: bridge}
		}
		// todo: we should render the nickname in other places too (add this to the title() etc. functions.
		// and then put like, some icon or whatever to show that they're nicked, I guess.
		
		// won't this fail on comments without a createuser for whatever reason??
		if (Object.first_key(override) != undefined)
			data.createUser = Object.create(data.createUser, override)
	},
	
/*	page_map(pages) {
		let map = {}
		pages && pages.forEach(p => map[p.id] = p)
		return this.safe_map(map, (id)=>({
			Type: 'content',
			name: `{content: ${id}}`,
			id: id,
			fake: true,
		}))
	},*/
	
	/*rebuildCategoryTree() {
		this.got_new_category = false
		Object.for(this.category_map, (cat)=> cat.children = [])
		// todo: make sure root category doesn't have parent
		Object.for(this.category_map, (cat)=>{
			let parent = this.category_map[cat.contentId] || this.category_map[0]
			if (cat.id != 0) {
				parent.children.push(cat)
				cat.parent = parent
			}
		})
	},*/
	// return: [text, metadata]
	is_new_comment(c) {
		return !c.deleted && !c.editDate
	},
})})()

'use strict'

class MessageList {
	constructor(element, pid, edit) {
		this.$list = element
		this.$list.classList.add('message-list') // todo: just create a new elem <message-list> ?
		this.pid = pid
		
		this.parts = new Map()
		// `this` is a node in the linked list!
		// top, bottom
		this.next = this.prev = this
		
		// this listens for events created by the message edit/info buttons
		// and modifies the event to add the message data
		this.$list.addEventListener('message_control', ev=>{
			let part = this.parts.get(+ev.target.dataset.id)
			if (part)
				ev.detail.data = part.data // eeehehe
		}, {capture: true})
		
		Object.seal(this)
	}
	
	check_merge(top, bottom) {
		if (top.Author.merge_hash==bottom.Author.merge_hash)
			if (Math.abs(bottom.Author.date.getTime() - top.Author.date.getTime())<=1e3*60*5)
				return true
		return false
	}
	
	remove(part) {
		if (part==this)
			throw new TypeError('tried to remove list terminator')
		let {prev, next, elem, data:{id}} = part
		// remove from map
		this.parts.delete(id)
		// update linked list
		prev.next = next
		next.prev = prev
		// remove element
		if (elem == MessageList.controls_message)
			MessageList.show_controls(null)
		if (elem.nextSibling || elem.previousSibling) {
			elem.remove()
		} else {
			// remove the message block
			elem.parentNode.parentNode.remove()
			// was first or last message block
			if (next==this || prev==this)
				return
			// merge surrounding blocks, if needed
			if (this.check_merge(prev.data, next.data)) {
				let die = next.elem.parentNode
				prev.elem.parentNode.append(...die.childNodes)
				die.parentNode.remove()
			}
		}
	}
	
	// draw a message
	// msg: Message
	// return: Element
	draw_part(msg) {	
		let e = MessageList.part_template()
		e.dataset.id = msg.id
		if (msg.edited)
			e.className += " edited"
		Markup.convert_lang(msg.text, msg.values.m, e, {intersection_observer: View.observer})
		return e
	}
	// draw a message and insert it into the linked list
	// msg: Message
	// prev,next: Part - surrounding list nodes
	add_part(msg, prev, next) {
		let elem = this.draw_part(msg)
		let part = {data:msg, elem, prev, next}
		this.parts.set(msg.id, next.prev = prev.next = part)
		return part
	}
	// display the first message in the list
	display_only(msg) {
		let part = this.add_part(msg, this, this)
		this.$list.append(MessageList.draw_block(msg, part.elem))
		return part
	}
	// display a new message at the top of the list
	display_top(msg) {
		let next = this.next
		let part = this.add_part(msg, this, next)
		if (this.check_merge(part.data, next.data))
			next.elem.before(part.elem) // todo: timestamp
		else
			this.$list.prepend(MessageList.draw_block(msg, part.elem))
		return part
	}
	// display a new message at the bottom of the list
	display_bottom(msg) {
		let prev = this.prev
		let part = this.add_part(msg, prev, this)
		if (this.check_merge(prev.data, part.data))
			prev.elem.after(part.elem)
		else
			this.$list.append(MessageList.draw_block(msg, part.elem))
		return part
	}
	
	// existing: Part - the part to replace
	// msg: Message - the new message data
	replace(existing, msg) {
		if (existing==this)
			throw new TypeError('tried to replace list terminator')
		let id = msg.id
		// deleted from this room
		if (msg.deleted) {
			this.remove(existing)
			return null
		}
		// moved to other room
		if (msg.contentId!=this.pid) { 
			if (!msg.edited)
				print("warning: impossible? ", id)
			this.remove(existing)
			return null
		}
		// normal edited message?
		if (!msg.edited)
			print("warning: duplicate message ", id)
		if (msg.Author.merge_hash != existing.data.Author.merge_hash)
			print("unimplemented: merge hash changed: ", id)
		let elem = this.draw_part(msg)
		existing.elem.replaceWith(elem)
		existing.elem = elem
		existing.data = msg
		return existing
	}
	
	// display a Message at the bottom of the list
	// ONLY use this for messages from live message_events
	// if cb is set, it will be called before a message is inserted
	// return: (todo improve this. rn we only use it for updating the title notif.)
	// true - new message added at bottom
	// false - replaced/removed an edited/deleted/rethreaded message
	// null - nothing
	display_live(msg, cb=null) {
		let id = msg.id
		
		let existing = this.parts.get(id)
		if (existing) {
			cb && cb()
			this.replace(existing, msg)
			return false
		}
		
		// deleted, or for another room
		if (msg.deleted || msg.contentId!=this.pid)
			return null
		
		let prev = this.prev
		if (prev==this) {
			cb && cb()
			// note: if message is edited, this isn't really safe
			// because it could be an old edited message
			// but, in practice, this only happens if the page
			// has no messages at all, because otherwise
			// we would've loaded initial messages
			/// but technically, we should check against the page's
			// lastmessageid, if we /aren't/ loading initial messages
			// to make sure the edited message is new message.
			this.display_only(msg)
			return true
		}
		if (id>prev.data.id) {
			cb && cb()
			this.display_bottom(msg)
			return true
		}
		
		if (!msg.edited)
			print("warning: out of order: ", id)
		
		// old message
		if (id < this.next.data.id)
			return null
		
		// rethreaded from another room
		print("unimplemented: rethread ", id)
		//this.rethread(msg)
		return false
	}
	
	// display a Message at the top or bottom of the list
	display_edge(msg) {
		let id = msg.id
		
		let existing = this.parts.get(id)
		if (existing) {
			print('warning: duplicate message? '+id)
			return this.replace(existing, msg)
		}
		
		if (this.next==this)
			return this.display_only(msg)
		if (id>this.prev.data.id)
			return this.display_bottom(msg)
		if (id<this.next.data.id)
			return this.display_top(msg)
		
		throw new Error("messages out of order?")
	}
	
	// todo
	// need to prevent this from loading messages multiple times at once
	// and inserting out of order...x
	load_messages_near(top, amount, callback) {
		let part = top ? this.next : this.prev
		if (part==this)
			return
		let id = part.data.id
		//
		let order = top ? 'id_desc' : 'id'
		let query = `contentId = @pid AND id ${top?"<":">"} @last AND !notdeleted()`
		Lp.chain({
			values: {last: id, pid: this.pid},
			requests: [
				{type:'message', fields:'*', query, order, limit:amount},
				{type:'user', fields:'*', query:"id in @message.createUserId"},
			],
		}, resp=>{
			let first = true
			for (let c of resp.message) {
				let part = this.display_edge(c)
				if (part && first) {
					part.elem.classList.add("boundary-"+(top?"bottom":"top"))
					first = false
				}
			}
			callback(resp.message.length != 0)
		})
	}
	// limiting number of displayed messages
	over_limit() {
		return this.parts.length > this.max_parts
	}
	limit_messages() {
		let over = this.parts.length - this.max_parts
		for (let i=0; i<over; i++)
			this.remove(this.next)
	}

	// elem: <message-part> or null
	static show_controls(elem) {
		if (elem == this.controls_message) // shouldn't happen?
			return
		if (elem)
			elem.before(this.controls)
		else
			this.controls.remove()
		this.controls_message = elem
	}
	
	static init() {
		// draw the message controls
		this.controls = document.createElement('message-controls')
		// draw the things
		let handler = ev=>{
			let action = ev.currentTarget.dataset.action
			let ev2 = new CustomEvent('message_control', {
				bubbles: true, cancellable: true,
				detail: {data: null, action},
			})
			this.controls_message.dispatchEvent(ev2)
		}
		// yeah
		let btn = (action, label)=>{
			let btn = document.createElement('button')
			btn.onclick = handler
			btn.dataset.action = action
			btn.tabIndex=-1
			btn.append(label)
			this.controls.append(btn)
		}
		btn('info', "⚙️")
		btn('edit', "✏️")
		
		let listen = (ev, fn)=>{
			document.addEventListener(ev, fn, {passive: true})
		}
		
		// todo: fix this so focusing shows controls again.
		// the issue is that clicking the buttons can alter focus
		// and on mobile, there are other issues too
		/*listen('focusin', e=>{
		  let elem = e.target.closest("message-part, .message-list")
		  if (!elem)
		  this.show_controls(null)
		  else if (elem.tagName=='MESSAGE-PART')
		  this.show_controls(elem)
		  })
		  listen('focusout', e=>{
		  //if (e.target.closest(".message-list"))
		  // TODO: fix flickering when button is clicked
		  this.show_controls(null)
		  })*/
		
		// show controls when hovering over a <message-part>
		
		// This works on mobile, because touches trigger mouseover.
		// the touch creates a virtual cursor which stays there,
		// until you touch somewhere else (which then triggers mouseleave)
		let enter = ev=>{
			let elem = ev.target.closest("message-part, message-controls, .message-list")
			if (!elem || elem.classList.contains('message-list'))
				this.show_controls(null)
			else if (elem.tagName=='MESSAGE-PART')
				this.show_controls(elem)
			// otherwise, the element is <message-controls> so we do nothing
		}
		
		if (IOS_SAFARI) {
			listen('click', enter)
			listen('touchstart', ev=>{
				if (!this.controls_message)
					return
				if (this.controls.contains(ev.target))
					return
				if (this.controls_message.contains(ev.target))
					;//return
				this.show_controls(null)
			})
		} else {
			listen('mouseover', enter)
			listen('mouseleave', ev=>{ this.show_controls(null) })
		}
	}
}
MessageList.part_template = 𐀶`<message-part role=listitem>`
MessageList.controls = null
MessageList.controls_message = null
MessageList.prototype.max_parts = 500
MessageList.draw_block = function(comment, part) {
	let e = this.block()
	
	let author = comment.Author
	
	e.dataset.uid = comment.createUserId
	/** @type {HTMLImageElement} */	
	let avatar = e.firstChild
	avatar.src = Draw.avatar_url(author)
	
	if (author.bigAvatar) {
		avatar.className = "bigAvatar"
		// for now we don't support both
	} else {
		if (author.avatar_pixel) {
			avatar.classList.add("apx")
			if (Settings.values.pixel_art=='on') {
				// TODO: what if setting is turned off while image is loading?
				if (avatar.naturalWidth) {
					recalc_image_scale(avatar)
				} else {
					avatar.decode().then(ok=>{
						recalc_image_scale(avatar)
					})
				}
			}
		}
	}
	
	let header = avatar.nextSibling
	
	let name = header.firstChild
	if (author.nickname == null) {
		name.firstChild.textContent = author.username
	} else {
		name.firstChild.textContent = author.nickname
		if (author.bridge)
			name.appendChild(this.bridge())
		else {
			let nickname = this.nickname()
			let realname = nickname.lastChild.lastElementChild
			realname.textContent = author.username
			name.appendChild(nickname)
		}
	}
	
	let time = header.lastChild
	//time.dateTime = comment.createDate
	time.textContent = "\t­\t"+Draw.time_string(comment.Author.date)
	
	e.lastChild.appendChild(part)
	
	return e
}.bind({
	block: 𐀶`
<message-block>
	<img class='avatar' width=50 height=50 alt="----">
	<message-header>
		<span><b class='pre'></b>:</span>
		<span role=time></span>
	</message-header>
	<div></div>
</message-block>`,
	nickname: 𐀶` <i>(<span class='pre'></span>)</i>`,
	bridge: 𐀶` <i>[discord bridge]</i>`,
})

/**
	@param {HTMLTableRowElement} row
	@param {int} data
	@returns {HTMLTableCellElement}
*/
const _insertHeaderCell = function(row, index = -1) {
	if (index < -1 || index > row.cells.length) {
		throw DOMException('IndexSizeError')
	} if (index < 0 || index >= row.cells.length) {
		return row.appendChild(document.createElement('th'))
	} else {
		return row.insertBefore(document.createElement('th'), row.cells[index])
	}
}

MessageList.draw_info_dialog = function(comment) {
	const dialog = this.dialog()
	dialog.addEventListener('close', _=>dialog.remove())
	
	/**
		@param {HTMLTableElement} table
		@param {Object} data
	*/
	function makeRecursiveTableRow(table, data, depth = 0) {
		if (depth > 16) return
		for (const [key, value] of Object.entries(data)) {
			const tr = table.insertRow()
			tr.style.setProperty('--row-depth', depth)
			const k = _insertHeaderCell(tr)
			k.textContent = key
			const v = tr.insertCell()
			if (value === null) {
				v.textContent = 'null'
			} else if (('object'==typeof value || 'array'==typeof value) && Object.keys(value).length > 0) {
				v.textContent = 'object'==typeof value ? '{' : '['
				makeRecursiveTableRow(table, value, depth + 1)
				const trend = table.insertRow()
				const tdend = _insertHeaderCell(trend)
				tdend.colSpan = 2
				tdend.style.setProperty('--row-depth', depth)
				tdend.textContent = 'object'==typeof value ? '}' : ']'
			} else if ('string'==typeof value) {
				// v.append('"')
				if (value.length > 80 || value.includes('\n')) {
					const tt = document.createElement('pre')
					tt.textContent = value
					v.appendChild(tt)
				} else {
					const tt = document.createElement('code')
					tt.textContent = value
					v.appendChild(tt)
				}
				// v.append('"')
			} else {
				v.textContent = JSON.stringify(value)
			}
		}
	}
	
	const table = dialog.firstChild
	makeRecursiveTableRow(table, comment)
	
	const form = table.nextSibling
	for (const [bname, bfunc] of Object.entries(CustomMessageActions)) {
		const btn = document.createElement('button')
		btn.textContent = bname
		btn.addEventListener('click', _=>bfunc(comment))
		form.appendChild(btn)
		form.append(' ')
	}
	form.appendChild(form.firstChild) // (the ok button)
	
	return dialog
}.bind({
	dialog: 𐀶`
<dialog class='message-info'>
	<table></table>
	<form method=dialog>
		<button class='message-info-dismiss'>Dismiss</button>
	</form>
</dialog>`,
	row: 𐀶`
		<tr><th>
`
})

MessageList.init()
Object.seal(MessageList)

document.addEventListener('message_control', ev=>{
	if (ev.detail.action == 'info') {
		const dialog = MessageList.draw_info_dialog(ev.detail.data)
		document.body.appendChild(dialog)
		dialog.showModal()
	} // <small heart>
})
var CustomMessageActions = {}
// CustomMessageActions['repeat message'] = (d) => TTSSystem.speakMessage(d)
// CustomMessageActions['add ❤️ react'] = (d) => Req.request(`Shortcuts/message/${d.id}/setengagement/reaction`, null, "❤️")
CustomMessageActions['copy link (range)'] = async function(d) {
	let clipboard = ""
	try { clipboard = await navigator.clipboard.readText() } catch {}
	const [_=0, pid=-1, cid_unsplit=""] = clipboard.match(/^sbs:comments\/(\d+)\?ids=((?:\d+[-,]?)+)$/) || []
	const cids = pid == d.contentId ? cid_unsplit.split(/[-,]/) : []
	cids.push(d.id)
	const separator = cids.length == 2 ? '-' : ','
	await navigator.clipboard.writeText(`sbs:comments/${d.contentId}?ids=${cids.join(separator)}`)
}
CustomMessageActions['edit values'] = function (data) {
	const dialog = 𐀶`
<dialog class='message-info'>
	<div>
		<button>get from settings</button>
		<button>put into settings</button>
	</div>
	<form method=dialog>
		<table>
		</table>
		<div style='text-align: right'>
			<button>Discard</button>
			<button class='message-info-dismiss'>Save</button>
		</div>
	</form>
</dialog>`()
	dialog.addEventListener('close', _=>dialog.remove())
	const [move_options, form] = dialog.children
	const [table, save_options] = form.children
	const [btn_get, btn_put] = move_options.children
	const [discard, save] = save_options.children
	const FIELDS = {
		'a': { name: 'avatar', settings_name: 'avatar' },
		'n': { name: 'nickname', settings_name: 'nickname' }
	}
	for (const [field, info] of Object.entries(FIELDS)) {
		const row = table.insertRow()
		const name = _insertHeaderCell(row)
		name.textContent = info.name
		const value = row.insertCell()
		const input = document.createElement('input')
		input.name = field
		input.dataset.settings_value = Settings.values[info.settings_name] || ''
		input.dataset.message_value = data.values[field] || ''
		input.value = input.dataset.message_value
		value.appendChild(input)
	}
	const flip_input_dataset = d => [d.settings_value, d.message_value] = [d.message_value, d.settings_value]
	btn_get.addEventListener('click', e=>{
		e.preventDefault()
		for (const [field, {settings_name}] of Object.entries(FIELDS)) {
			const el = form.elements[field]
			el.value = el.dataset.settings_value
			flip_input_dataset(el.dataset)
		}
		btn_put.disabled = !btn_put.disabled
		btn_get.textContent = 'un' + btn_get.textContent
	})
	btn_put.addEventListener('click', e=>{
		e.preventDefault()
		for (const [field, {settings_name}] of Object.entries(FIELDS)) {
			const el = form.elements[field]
			const settings_field = Settings.fields.find(f=>f.name==settings_name)
			settings_field.change('change', el.dataset.message_value)
			settings_field.elem.value = settings_field.get_value()
			flip_input_dataset(el.dataset)
		}
		btn_get.disabled = !btn_get.disabled
		btn_put.textContent = 'un' + btn_put.textContent
	})
	const should_send = Array.prototype.some.bind(Object.keys(FIELDS), f=>data.values[f] != form.elements[f].value)
	const commit_data = function() {
		for (const field of Object.keys(FIELDS)) {
			const v = form.elements[field].value
			if (data.values[field] == v) continue
			if (v.length) data.values[field] = v
			else delete data.values[field]
		}
		Req.send_message(data).do = (_resp, err)=>{
			if (err)
				alert("Posting failed")
		}
	}
	save.addEventListener('click', _=>should_send() && commit_data())
	document.body.appendChild(dialog)
	dialog.showModal()
}

'use strict'

// it would be nice to inject this earlier but 
let ls = Settings.values.html_inject
if ('string'==typeof ls)
	document.write(ls)

document.addEventListener('DOMContentLoaded', dom_ready)
immediate()

function immediate() {
	console.log("🌅 STARTING INIT")
	Sidebar.print("hi!\ncommit: "+window.COMMIT)
	
	try {
		undefined = 2
		console.warn("'use strict' not enabled!") // todo: warn/error printing ? higher priority? (pin to bottom?)
		do_when_ready(x=>print("⚠️ 'use strict' not enabled!"))
	} catch (e) {}
	
	Req.try_load_auth()
	
	if (!Req.auth) {
		console.warn("🌇 Not logged in!")
		return
	}
	
	View.login_state(true)
	
	Settings.init()
	
	Lp.init()
	
	// get own user
	Lp.chain({
		values: {uid:Req.uid},
		requests: [{type:'user', fields:'*', query:"id = @uid"}],
	}, resp=>{
		let me = resp.user[0]
		if (!me) {
			console.error(resp, 'me?"')
			throw "missing user me?"
		}
		console.log("🌄 Got own userdata")
		Req.me = me
		do_when_ready(()=> View.update_my_user(Req.me))
	})
	
	StatusDisplay.global.set_status("active")
	
	Lp.start_websocket()
	
	Act.pull_recent()
	
	Nav.init()
	
}

function dom_ready() {
	console.log("🌄 DOCUMENT READY")
	
	// set up event handlers:
	
	document.onmousedown = (e)=>{
		// 0 or none (prevent right click etc.)
		if (!e.button && e.target)
			image_focus_click_handler(e.target)
	}
	document.addEventListener('videoclicked', (e)=>{
		image_focus_click_handler(e.target, true)
	})
	
	let embiggened_image
	// clicking outside an image shrinks it
	// maybe could block this if the click is on a link/button?
	document.onclick = (e)=>{
		let element = e.target
		if (!(element instanceof HTMLTextAreaElement)) {
			if (embiggened_image && element != embiggened_image) {
				delete embiggened_image.dataset.big
				embiggened_image = null
			}
		}
	}
	
	function image_focus_click_handler(element, grow_only) {
		if (element.dataset.shrink != null) {
			// if click on image that's already big:
			if (embiggened_image && embiggened_image == element) {
				if (!grow_only) {
					delete embiggened_image.dataset.big
					embiggened_image = null
				}
			} else if (element != embiggened_image) { // if click on new iamge
				embiggened_image && delete embiggened_image.dataset.big
				element.dataset.big = ""
				embiggened_image = element
			}
		}
	}
	
	View.$header = $titlePane
	
	MessageList.onload()
	
	print("running "+run_on_load.length+" deferred items")
	do_when_ready = x=>x()
	do_when_ready.then = null
	run_on_load.forEach(x=>x())
	run_on_load = null
	DEFER = x=>void x()
	//Object.defineProperty(ready, 'do', {set: fn=>fn()})
	
	//danger: View.onload() can potentially run after view.start() (but before view.render())  TODO
	window.onerror = function(message, source, line, col, error) {
		let ok
		try {
			// syntax errors may be "muted" for security reasons
			// in that case, create a fake error with the info we have
			// (generally, that's only the filename)
			if (!error) {
				error = new Error(message)
				error.stack = "@"+source+":"+line+":"+col
			}
			Sidebar.print(error)
			ok = true
		} finally {
			if (!ok)
				alert("error while handling error!")
		}
	}
}

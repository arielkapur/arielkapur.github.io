const CURSOR_ID = 'cursor';

(function initCustomCursor(){
    function createCursorEl(){
        let el = document.getElementById(CURSOR_ID);
        if(el) return el;
        el = document.createElement('div');
        el.id = CURSOR_ID;
        el.setAttribute('aria-hidden', 'true');
        const img = document.createElement('img');
        img.src = 'images/cursor_max.webp';
        img.alt = '';
        el.appendChild(img);
        document.body.appendChild(el);
        return el;
    }

    function ready(fn){
        if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    ready(()=>{
        const cursor = createCursorEl();

        // don't enable on coarse / touch devices
        const isCoarse = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
        if(isCoarse){
            cursor.style.display = 'none';
            document.body.style.cursor = '';
            return;
        }

        document.body.classList.add('custom-cursor-enabled');

        // ensure basic styles (in case CSS didn't load yet)
        Object.assign(cursor.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            width: cursor.style.width || '16px',
            height: cursor.style.height || '16px',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%) rotate(0deg)',
            zIndex: '9999',
            willChange: 'transform, opacity'
        });

        // make cursor visible but keep it transparent until movement
        cursor.style.visibility = 'visible';
        cursor.style.opacity = '0';

        // Elements that make the cursor "active" (grow) and/or "white" (invert) on hover/focus.
        // Bound dynamically so elements added after page load (e.g. JS-generated labels/buttons
        // in map.html) pick up the same cursor behavior without any extra wiring.
        const interactiveSelectors = 'a,button,input,textarea,select,label,[data-cursor-active]';
        const highlightSelector = '.reveal-highlight';
        const bound = new WeakSet();

        function bindOne(el){
            if(bound.has(el)) return;
            bound.add(el);
            if(el.matches(interactiveSelectors)){
                el.addEventListener('mouseenter', ()=> cursor.classList.add('cursor-active'));
                el.addEventListener('mouseleave', ()=> cursor.classList.remove('cursor-active'));
            }
            if(el.matches(highlightSelector)){
                el.addEventListener('mouseenter', ()=> cursor.classList.add('cursor-white'));
                el.addEventListener('mouseleave', ()=> cursor.classList.remove('cursor-white'));
                el.addEventListener('focus', ()=> cursor.classList.add('cursor-white'));
                el.addEventListener('blur', ()=> cursor.classList.remove('cursor-white'));
            }
        }

        function bindAllListeners(root){
            (root || document).querySelectorAll(`${interactiveSelectors},${highlightSelector}`).forEach(bindOne);
        }

        // initial bind and mutation observer for dynamic content (works for both
        // static markup and elements created later by page scripts)
        bindAllListeners();
        const mo = new MutationObserver((mutations)=>{
            mutations.forEach(m=>{
                m.addedNodes && m.addedNodes.forEach(node=>{
                    if(node.nodeType !== 1) return;
                    if(node.matches && (node.matches(interactiveSelectors) || node.matches(highlightSelector))) bindOne(node);
                    if(node.querySelectorAll) bindAllListeners(node);
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });

        let mouseX = window.innerWidth/2, mouseY = window.innerHeight/2;
        let curX = mouseX, curY = mouseY;
        let rotation = 0;
        let visible = true;

        window.addEventListener('mousemove', (e)=>{
            mouseX = e.clientX;
            mouseY = e.clientY;
            rotation += 18; // give a spin bump
            visible = true;
            // ensure visible immediately on first move
            cursor.style.visibility = 'visible';
            cursor.style.opacity = '1';
        });

        window.addEventListener('mouseleave', ()=>{
            visible = false;
            cursor.style.opacity = '0';
            // hide after transition
            setTimeout(()=>{
                if(cursor.style.opacity === '0') cursor.style.visibility = 'hidden';
            }, 160);
        });

        function animate(){
            // simple lerp for smooth movement
            curX += (mouseX - curX) * 0.18;
            curY += (mouseY - curY) * 0.18;
            cursor.style.left = curX + 'px';
            cursor.style.top = curY + 'px';
            const scale = cursor.classList && cursor.classList.contains('cursor-active') ? 1.35 : 1;
            cursor.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`;
            // decay rotation
            rotation *= 0.98;
            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    });
})();

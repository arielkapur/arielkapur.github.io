const CURSOR_ID = 'cursor';

(function initCustomCursor(){
    function createCursorEl(){
        let el = document.getElementById(CURSOR_ID);
        if(el) return el;
        el = document.createElement('div');
        el.id = CURSOR_ID;
        el.setAttribute('aria-hidden', 'true');
        const img = document.createElement('img');
        img.src = 'images/cursor.webp';
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

        // hide native cursor
        document.body.style.cursor = 'none';

        // ensure basic styles (in case CSS didn't load yet)
        Object.assign(cursor.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            width: cursor.style.width || '32px',
            height: cursor.style.height || '32px',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%) rotate(0deg)',
            zIndex: '9999',
            willChange: 'transform, opacity'
        });

        // make cursor visible but keep it transparent until movement
        cursor.style.visibility = 'visible';
        cursor.style.opacity = '0';

        const interactiveSelectors = 'a,button,input,textarea,select,label';
        document.querySelectorAll(interactiveSelectors).forEach(el=>{
            el.addEventListener('mouseenter', ()=> cursor.classList.add('cursor-active'));
            el.addEventListener('mouseleave', ()=> cursor.classList.remove('cursor-active'));
        });

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

  function bindTabs(sel, getPanel){
    const tabs=[...document.querySelectorAll(sel)];
    tabs.forEach(t=>t.addEventListener('click',()=>{
      tabs.forEach(x=>{x.setAttribute('aria-selected',x===t);getPanel(x).hidden=x!==t;});
    }));
  }
  bindTabs('.tab',x=>document.getElementById(x.getAttribute('aria-controls')));
  bindTabs('.ntab',x=>document.getElementById(x.dataset.list));
  const mb=document.getElementById('menuBtn'),nav=document.getElementById('mainNav');
  const setMenu=o=>{nav.classList.toggle('open',o);mb.setAttribute('aria-expanded',o);mb.setAttribute('aria-label',o?'メニューを閉じる':'メニューを開く');};
  mb.addEventListener('click',()=>setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));

  // visit form
  (function(){
    const f=document.getElementById('visitForm'),th=document.getElementById('visitThanks'),sum=document.getElementById('visitSummary');
    if(!f)return;
    const pad=n=>String(n).padStart(2,'0');
    const t=new Date();t.setDate(t.getDate()+1);
    const minStr=t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(t.getDate());
    ['v-date1','v-date2'].forEach(id=>document.getElementById(id).min=minStr);
    const setErr=(id,msg)=>{const el=document.getElementById(id),e=f.querySelector('.err[data-for="'+id+'"]');if(el.type!=='checkbox')el.classList.toggle('invalid',!!msg);if(e)e.textContent=msg||'';return !msg;};
    const weekend=v=>{if(!v)return false;const d=new Date(v+'T00:00:00').getDay();return d===0||d===6;};
    const fmt=v=>{if(!v)return '';const d=new Date(v+'T00:00:00');return (d.getMonth()+1)+'月'+d.getDate()+'日（'+'日月火水木金土'[d.getDay()]+'）';};
    function check(){
      let ok=true;const v=id=>document.getElementById(id).value.trim();
      ok&=setErr('v-name',v('v-name')?'':'お名前を入力してください');
      ok&=setErr('v-kana',v('v-kana')?'':'ふりがなを入力してください');
      const tel=v('v-tel').replace(/[^0-9]/g,'');
      ok&=setErr('v-tel',!tel?'電話番号を入力してください':(tel.length<10||tel.length>11)?'電話番号は10〜11桁の数字で入力してください':'');
      const m=v('v-mail');ok&=setErr('v-mail',m&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)?'メールアドレスの形式を確認してください':'');
      ok&=setErr('v-place',v('v-place')?'':'見学を希望する事業所を選んでください');
      const d1=v('v-date1'),d2=v('v-date2');
      ok&=setErr('v-date1',!d1?'第1希望日を選んでください':weekend(d1)?'土日はお休みです。平日を選んでください':d1<minStr?'明日以降の日付を選んでください':'');
      ok&=setErr('v-date2',d2&&weekend(d2)?'土日はお休みです。平日を選んでください':d2&&d2<minStr?'明日以降の日付を選んでください':'');
      const ci=window.__courseInfo();ok&=setErr('v-num',(ci.n<ci.min||ci.n>ci.max)?'このコースの人数は'+ci.min+'〜'+ci.max+'名です':'');
      ok&=setErr('v-agree',document.getElementById('v-agree').checked?'':'個人情報の取り扱いへの同意が必要です');
      return !!ok;
    }
    f.addEventListener('input',e=>{if(e.target.classList.contains('invalid'))check();});
    f.addEventListener('submit',e=>{
      e.preventDefault();
      if(!check()){const first=f.querySelector('.invalid')||document.getElementById('v-agree');first.focus();return;}
      const fd=new FormData(f);
      const ci=window.__courseInfo();
      const rows=[['見学コース',ci.name],['料金の目安',ci.price===0?'無料':ci.total.toLocaleString('ja-JP')+'円（'+ci.n+'名・当日現金）'],['お名前',fd.get('name')+'（'+fd.get('kana')+'）'],['電話番号',fd.get('tel')],['メール',fd.get('mail')||'—'],['ご見学される方',fd.get('who')],['事業所',fd.get('place')],['第1希望',fmt(fd.get('date1'))+' '+fd.get('time')],['第2希望',fd.get('date2')?fmt(fd.get('date2')):'—'],['人数',fd.get('num')+'名'],['ご相談',fd.get('msg')||'—']];
      sum.innerHTML='';rows.forEach(([k,val])=>{const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=val;sum.append(dt,dd);});
      // 本番ではここでサーバー（WordPressのフォームプラグイン等）へ送信します
      f.hidden=true;th.hidden=false;th.scrollIntoView({behavior:'smooth',block:'start'});
    });
    document.getElementById('visitBack').addEventListener('click',()=>{th.hidden=true;f.hidden=false;f.scrollIntoView({behavior:'smooth',block:'start'});});
  })();

  // courses
  (function(){
    const P={visit60:{n:'A　はじめての見学コース',p:0,min:1,max:4},taiken:{n:'B　見学＋作業体験コース',p:500,min:1,max:3},group:{n:'C　団体・研修コース',p:1000,min:5,max:20},kuri:{n:'D　施設見学＋くりくりの里お食事コース',p:5000,min:2,max:20}};
    const sel=document.getElementById('v-course'),num=document.getElementById('v-num'),lab=document.getElementById('pickLabel'),pr=document.getElementById('pickPrice');
    if(!sel)return;
    const cards=[...document.querySelectorAll('.course')];
    window.__courseInfo=()=>{const c=P[sel.value],n=parseInt(num.value,10)||0;return {name:c.n,total:c.p*n,price:c.p,n,min:c.min,max:c.max};};
    function update(){
      const c=P[sel.value];num.min=c.min;num.max=c.max;
      const n=parseInt(num.value,10)||0;
      lab.textContent=c.n;
      pr.textContent=c.p===0?'無料':(c.p*n).toLocaleString('ja-JP')+'円（'+n+'名）';
      cards.forEach(el=>el.classList.toggle('is-picked',el.dataset.course===sel.value));
    }
    sel.addEventListener('change',()=>{const c=P[sel.value];let n=parseInt(num.value,10)||c.min;num.value=Math.min(Math.max(n,c.min),c.max);update();});
    num.addEventListener('input',update);
    document.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{sel.value=b.dataset.pick;sel.dispatchEvent(new Event('change'));}));
    update();
  })();

// service page: open tab from #shop / #products
(function(){
  const map={shop:'t-shop',products:'t-prod',facility:'t-fac'};
  const id=map[location.hash.replace('#','')];
  if(id){const t=document.getElementById(id);if(t)t.click();}
})();

// hero slideshow
(function(){
  const root=document.querySelector('.hs'); if(!root) return;
  const slides=[...root.querySelectorAll('.hs-slide')], dots=[...root.querySelectorAll('.hs-dot')];
  const pauseBtn=root.querySelector('.hs-pause');
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i=0, timer=null, playing=!reduce;
  function show(n){
    i=(n+slides.length)%slides.length;
    slides.forEach((s,k)=>{s.classList.toggle('is-active',k===i);s.setAttribute('aria-hidden',k===i?'false':'true');});
    dots.forEach((d,k)=>{d.classList.toggle('is-active',k===i);if(k===i)d.setAttribute('aria-current','true');else d.removeAttribute('aria-current');});
  }
  function start(){stop(); if(playing) timer=setInterval(()=>show(i+1),2000);}
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  root.querySelector('.hs-prev').addEventListener('click',()=>{show(i-1);start();});
  root.querySelector('.hs-next').addEventListener('click',()=>{show(i+1);start();});
  dots.forEach((d,k)=>d.addEventListener('click',()=>{show(k);start();}));
  pauseBtn.addEventListener('click',()=>{playing=!playing;pauseBtn.textContent=playing?'❚❚':'▶';pauseBtn.setAttribute('aria-label',playing?'自動再生を止める':'自動再生を始める');start();});
  root.addEventListener('focusin',stop); root.addEventListener('focusout',start);
  let x0=null; root.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
  root.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40){show(i+(dx<0?1:-1));start();}x0=null;});
  if(!playing){pauseBtn.textContent='▶';pauseBtn.setAttribute('aria-label','自動再生を始める');}
  start();
})();

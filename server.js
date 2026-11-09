// MB Arena multiplayer server: friends, custom rooms, real-time relay. Also serves MB_Arena.html.
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||8080,DBF=path.join(__dirname,'data.json');
let db={players:{},friends:{},pending:{}};try{db=Object.assign(db,JSON.parse(fs.readFileSync(DBF,'utf8')));}catch(e){}
let st=null;const save=()=>{clearTimeout(st);st=setTimeout(()=>fs.writeFile(DBF,JSON.stringify(db),()=>{}),500);};
const conns=new Map(),rooms=new Map();
const srv=http.createServer((q,s)=>{const f=path.join(__dirname,'MB_Arena.html');fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end('Put MB_Arena.html next to server.js');return;}s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(d);});});
const wss=new WebSocketServer({server:srv});
const tx=(ws,o)=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));};
const arr=(o,k)=>(o[k]=o[k]||[]);
function flist(id){return arr(db.friends,id).map(f=>({id:f,n:(db.players[f]||{}).n||f,on:conns.has(f)}));}
function pushF(id){tx(conns.get(id),{t:'friends',list:flist(id),req:arr(db.pending,id).map(f=>({id:f,n:(db.players[f]||{}).n||f}))});}
function pushAllF(id){pushF(id);arr(db.friends,id).forEach(pushF);}
function view(r,forId){return{id:r.id,pass:forId===r.host?r.pass:undefined,host:r.host,map:r.map,mode:r.mode,dur:r.dur,max:r.max,started:r.started,
  players:[...r.players].map(([id,p])=>({id,n:p.n,r:p.r,k:p.k,team:Math.floor(p.idx/({solo:1,duo:2,squad:4}[r.mode]||1))}))};}
function rb(r,o,except){r.players.forEach((p,id)=>{if(id!==except)tx(p.ws,o);});}
function rsync(r){r.players.forEach((p,id)=>tx(p.ws,{t:'room',room:view(r,id)}));}
function leave(ws,why){const r=rooms.get(ws.room);ws.room=null;if(!r)return;
  if(r.host===ws.uid){clearTimeout(r.tm);rb(r,{t:'closed',why:why||'Host closed the room'},ws.uid);r.players.forEach(p=>p.ws.room=null);rooms.delete(r.id);return;}
  r.players.delete(ws.uid);rb(r,{t:'left',id:ws.uid});rsync(r);}
function endMatch(r){clearTimeout(r.tm);if(!r.started)return;r.started=false;
  const res=[...r.players].map(([id,p])=>({id,n:p.n,k:p.k})).sort((a,b)=>b.k-a.k);
  r.players.forEach(p=>{p.r=false;});rb(r,{t:'results',res});rsync(r);}
const rid=()=>{const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=c[Math.random()*c.length|0];return rooms.has(s)?rid():s;};
wss.on('connection',ws=>{
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw);}catch(e){return;}
    if(m.t==='hello'){if(!/^\d{8}$/.test(m.id))return tx(ws,{t:'err',m:'Invalid Player ID'});
      const old=conns.get(m.id);if(old&&old!==ws){old.uid=null;old.close();}
      ws.uid=m.id;conns.set(m.id,ws);db.players[m.id]={n:String(m.n||'Player').slice(0,16)};save();tx(ws,{t:'ready',id:m.id});pushAllF(m.id);return;}
    const me=ws.uid;if(!me)return;
    switch(m.t){
    case'fadd':{const to=String(m.id||'');if(to===me)return tx(ws,{t:'err',m:'That is your own ID'});
      if(!db.players[to])return tx(ws,{t:'err',m:'No player with ID '+to+' (they must connect once first)'});
      if(arr(db.friends,me).includes(to))return tx(ws,{t:'err',m:'Already friends'});
      if(arr(db.pending,me).includes(to)){acc(me,to);return;}
      if(!arr(db.pending,to).includes(me))db.pending[to].push(me);save();pushF(to);tx(ws,{t:'info',m:'Request sent'});break;}
    case'facc':acc(me,String(m.id));break;
    case'fdel':{const o=String(m.id);db.pending[me]=arr(db.pending,me).filter(x=>x!==o);save();pushF(me);break;}
    case'rcreate':{leave(ws);const r={id:rid(),pass:String(1000+Math.random()*9000|0),host:me,map:m.map|0,mode:['solo','duo','squad'].includes(m.mode)?m.mode:'solo',
      dur:Math.min(30,Math.max(1,m.dur|0||5)),max:Math.min(16,Math.max(2,m.max|0||4)),started:false,players:new Map(),tm:null};
      r.players.set(me,{n:db.players[me].n,r:true,k:0,ws,idx:0});rooms.set(r.id,r);ws.room=r.id;tx(ws,{t:'room',room:view(r,me)});break;}
    case'rjoin':{const r=rooms.get(String(m.id||'').toUpperCase());
      if(!r||r.pass!==String(m.pass))return tx(ws,{t:'err',m:'Wrong Room ID or password'});
      if(r.started)return tx(ws,{t:'err',m:'Match already started'});if(r.players.size>=r.max)return tx(ws,{t:'err',m:'Room is full'});
      leave(ws);let idx=0;const used=new Set([...r.players.values()].map(p=>p.idx));while(used.has(idx))idx++;
      r.players.set(me,{n:db.players[me].n,r:false,k:0,ws,idx});ws.room=r.id;rsync(r);break;}
    case'rset':{const r=rooms.get(ws.room);if(!r||r.host!==me||r.started)return;
      if(m.map!=null)r.map=m.map|0;if(['solo','duo','squad'].includes(m.mode))r.mode=m.mode;if(m.dur)r.dur=Math.min(30,Math.max(1,m.dur|0));
      if(m.max)r.max=Math.min(16,Math.max(r.players.size,Math.max(2,m.max|0)));rsync(r);break;}
    case'ready':{const r=rooms.get(ws.room);if(!r||r.started)return;const p=r.players.get(me);p.r=!p.r;rsync(r);break;}
    case'kick':{const r=rooms.get(ws.room);if(!r||r.host!==me)return;const p=r.players.get(String(m.id));if(!p||m.id===me)return;
      tx(p.ws,{t:'kicked'});p.ws.room=null;r.players.delete(String(m.id));rb(r,{t:'left',id:String(m.id)});rsync(r);break;}
    case'rclose':leave(ws);break;
    case'rleave':leave(ws,'');break;
    case'rstart':{const r=rooms.get(ws.room);if(!r||r.host!==me||r.started)return;
      if([...r.players].some(([id,p])=>id!==me&&!p.r))return tx(ws,{t:'err',m:'Everyone must press Ready first'});
      r.started=true;r.players.forEach(p=>p.k=0);rb(r,{t:'start',map:r.map,mode:r.mode,dur:r.dur,room:null});tx(ws,{t:'start',map:r.map,mode:r.mode,dur:r.dur});
      rsync(r);r.tm=setTimeout(()=>endMatch(r),r.dur*60000);break;}
    case'invite':{const r=rooms.get(ws.room);if(!r||r.host!==me)return;tx(conns.get(String(m.id)),{t:'invite',from:db.players[me].n,room:r.id,pass:r.pass});break;}
    case'pos':{const r=rooms.get(ws.room);if(!r||!r.started||!m.d)return;const d=m.d;
      rb(r,{t:'pos',id:me,d:{x:+d.x||0,y:+d.y||0,z:+d.z||0,yaw:+d.yaw||0,n:String(d.n||'').slice(0,16),c:d.c,u:me}},me);break;}
    case'score':{const r=rooms.get(ws.room);if(!r||!r.started)return;r.players.get(me).k=m.k|0;
      const s=[...r.players].map(([id,p])=>({id,n:p.n,k:p.k}));r.players.forEach(p=>tx(p.ws,{t:'score',s}));break;}
    case'rend':{const r=rooms.get(ws.room);if(r&&r.host===me)endMatch(r);break;}
    }});
  ws.on('close',()=>{if(ws.uid&&conns.get(ws.uid)===ws){leave(ws,'Host disconnected');conns.delete(ws.uid);pushAllF(ws.uid);}});
});
function acc(me,o){db.pending[me]=arr(db.pending,me).filter(x=>x!==o);if(!arr(db.friends,me).includes(o))db.friends[me].push(o);if(!arr(db.friends,o).includes(me))db.friends[o].push(me);save();pushF(me);pushF(o);}
srv.listen(PORT,()=>console.log('MB Arena server on http://localhost:'+PORT));

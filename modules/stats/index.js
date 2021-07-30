"use strict";
const fetch=require("node-fetch");
function sleep(ms){return new Promise(resolve=>setTimeout(()=>resolve(),ms));};
module.exports=async(svr)=>{
const {db,pr}=svr.locals;
var stats={};
svr.get("/",(req,res)=>{
    res.render('stats',{
        stats,
        admin:req.admin
    });
});
svr.get("/stats/data",(req,res)=>{res.json(stats);});
svr.get("/stats/:sid",(req,res)=>{
    var {sid}=req.params,node=stats[sid];
    res.render('stat',{
        sid,node,
        traffic:db.traffic.get(sid),
        admin:req.admin
    });
});
svr.get("/stats/:sid/data",(req,res)=>{
    var {sid}=req.params;
    res.json({sid,...stats[sid]});
});
svr.post("/stats/update",(req,res)=>{
    var {sid,data}=req.body;
    stats[sid]=data;
    res.json(pr(1,'update success'));
});
async function getStat(server){
    try{
        var res=await fetch(`http://${server.data.ssh.host}:${server.data.api.port}/stat`,{
            method:"GET",headers:{key:server.data.api.key},
        }).then(res=>res.json());
    }catch(e){
        // console.log(e);
        res={success:false,msg:'timeout'};
    }
    if(res.success)return res.data;
    else return false;
}
async function update(server){
    var stat=-1;
    if(server.status==1)stat=await getStat(server);
    if(stat==-1){delete stats[server.sid];return;}
    if(server.data.device&&stat){
        var device=stat.net.devices[server.data.device];
        if(device){
            stat.net.total=device.total;
            stat.net.delta=device.delta;
        }
    }
    stats[server.sid]={name:server.name,stat};
}
async function get(){
    var s=new Set();
    for(var server of db.servers.all())
        if(server.status==1){
            update(server),s.add(server.sid);
            await sleep(300);
        }    
    for(var [sid,stat] of Object.entries(stats)){
        delete stats[sid];
        if(s.has(sid))stats[sid]=stat;
    }
}
function calc(){
    for(var server of db.servers.all()){
        var {sid}=server,stat=stats[sid];
        if(!stat||!stat.stat||stat.stat==-1)continue;
        var ni=stat.stat.net.total.in,
            no=stat.stat.net.total.out,
            t=db.lt.get(sid)||db.lt.ins(sid);
        var ti=ni<t.traffic[0]?ni:ni-t.traffic[0],
            to=no<t.traffic[1]?no:no-t.traffic[1];
        db.lt.set(sid,[ni,no]);
        db.traffic.add(sid,[ti,to]);
    }
}
get();
setInterval(get,3000);
sleep(10000).then(calc);
setInterval(calc,60*1000);
}

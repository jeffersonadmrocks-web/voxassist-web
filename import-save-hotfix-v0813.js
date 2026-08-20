/* VoxAssist V0.8.13 — hotfix de gravação da importação Whirlpool */
(function(){
  if(typeof api!=='function') return;
  const originalApi=api;
  api=async function(path,opt={}){
    try{
      const base=String(path||'').split('?')[0];
      if(base==='clients' && String(opt?.method||'GET').toUpperCase()==='POST' && typeof opt.body==='string'){
        const payload=JSON.parse(opt.body);
        const stripGenerated=(row)=>{
          if(row && typeof row==='object' && !Array.isArray(row)){
            const clean={...row};
            delete clean.document_digits;
            return clean;
          }
          return row;
        };
        const cleaned=Array.isArray(payload)?payload.map(stripGenerated):stripGenerated(payload);
        opt={...opt,body:JSON.stringify(cleaned)};
      }
    }catch(e){console.warn('VoxAssist import hotfix: payload mantido sem alteração',e)}
    return originalApi(path,opt);
  };
})();

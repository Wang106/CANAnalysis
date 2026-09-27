(function(){
  'use strict';

  const commitEl=document.getElementById('hcommit');
  const releaseEl=document.getElementById('hmodtime');
  if(!commitEl||!releaseEl) return;

  function setReleaseTime(d,source){
    if(!d||typeof d.getTime!=='function'||Number.isNaN(d.getTime())) return;
    const pad=n=>String(n).padStart(2,'0');
    const dateStr=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const timeStr=pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
    releaseEl.textContent=dateStr+' '+timeStr+'发布';
    releaseEl.dataset.source=source||'default';
    releaseEl.title=source==='cloudflare'?'Cloudflare 生产部署完成时间':'等待获取 Cloudflare 生产部署完成时间';
  }

  function latestSuccessfulDeployment(checkRuns){
    if(!Array.isArray(checkRuns)) return null;
    return checkRuns
      .filter(c=>c&&typeof c.name==='string'&&c.name.startsWith('Workers Builds:')&&c.conclusion==='success'&&c.completed_at)
      .sort((a,b)=>Date.parse(b.completed_at)-Date.parse(a.completed_at))[0]||null;
  }

  function setCommitDisplay(commit,source){
    if(typeof commit!=='string'||!commit.trim()) return;
    const normalized=commit.trim();
    commitEl.textContent=normalized.slice(-8);
    commitEl.dataset.source=source||'manifest';
    commitEl.title='GitHub 提交号 '+normalized+(source==='manifest'?'（站点版本清单）':'');
  }

  setReleaseTime(new Date(2000,0,1,0,0,0),'default');
  (async function(){
    let commit='';
    try{
      const response=await fetch('/version.json',{cache:'no-store'});
      if(!response.ok) throw new Error('Version manifest request failed');
      const metadata=await response.json();
      setCommitDisplay(metadata&&metadata.commit,'manifest');
      commit=metadata&&metadata.commit||'';
    }catch(error){}
    try{
      const response=await fetch('https://api.github.com/repos/Wang106/CANAnalysis/commits/main',{
        cache:'no-store',headers:{Accept:'application/vnd.github+json'}
      });
      if(!response.ok) throw new Error('GitHub commit request failed');
      const data=await response.json();
      if(data&&data.sha){commit=data.sha;setCommitDisplay(commit,'github');}
    }catch(error){}
    try{
      const response=await fetch('https://api.github.com/repos/Wang106/CANAnalysis/commits/'+encodeURIComponent(commit||'main')+'/check-runs?per_page=100',{
        cache:'no-store',
        headers:{Accept:'application/vnd.github+json'}
      });
      if(!response.ok) throw new Error('GitHub checks request failed');
      const data=await response.json();
      const deployment=latestSuccessfulDeployment(data&&data.check_runs);
      if(deployment){
        if(deployment.head_sha)setCommitDisplay(deployment.head_sha,'github');
        setReleaseTime(new Date(deployment.completed_at),'cloudflare');
      }
    }catch(error){}
  })();

  window.__siteVersion={setReleaseTime,latestSuccessfulDeployment,setCommitDisplay};
})();

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
    releaseEl.dataset.source=source||'fallback';
    releaseEl.title=source==='cloudflare'?'Cloudflare 生产部署完成时间':'代码提交时间（部署记录不可用时的回退值）';
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
    commitEl.textContent=normalized.slice(0,8);
    commitEl.dataset.source=source||'manifest';
    commitEl.title='GitHub 提交号 '+normalized+(source==='manifest'?'（站点版本清单）':'');
  }

  setReleaseTime(new Date('2026-09-13T13:30:35Z'),'fallback');
  (async function(){
    let committedAt=null;
    try{
      const response=await fetch('/version.json',{cache:'no-store'});
      if(!response.ok) throw new Error('Version manifest request failed');
      const metadata=await response.json();
      setCommitDisplay(metadata&&metadata.commit,'manifest');
      committedAt=metadata&&metadata.committedAt;
    }catch(error){}
    try{
      const response=await fetch('https://api.github.com/repos/Wang106/CANAnalysis/commits/main/check-runs?per_page=100',{
        headers:{Accept:'application/vnd.github+json'}
      });
      if(!response.ok) throw new Error('GitHub checks request failed');
      const data=await response.json();
      const deployment=latestSuccessfulDeployment(data&&data.check_runs);
      if(deployment){ setReleaseTime(new Date(deployment.completed_at),'cloudflare'); return; }
    }catch(error){}
    if(committedAt) setReleaseTime(new Date(committedAt),'commit');
  })();

  window.__siteVersion={setReleaseTime,latestSuccessfulDeployment,setCommitDisplay};
})();

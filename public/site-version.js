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
    releaseEl.title=source==='github'?'GitHub 代码提交时间':'等待获取 GitHub 代码提交时间';
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
    try{
      const response=await fetch('/version.json',{cache:'no-store'});
      if(!response.ok) throw new Error('Version manifest request failed');
      const metadata=await response.json();
      setCommitDisplay(metadata&&metadata.commit,'manifest');
    }catch(error){}
    try{
      const response=await fetch('https://api.github.com/repos/Wang106/CANAnalysis/commits/main',{
        cache:'no-store',headers:{Accept:'application/vnd.github+json'}
      });
      if(!response.ok) throw new Error('GitHub commit request failed');
      const data=await response.json();
      if(data&&data.sha){
        setCommitDisplay(data.sha,'github');
        const committedAt=data.commit&&data.commit.committer&&data.commit.committer.date||data.commit&&data.commit.author&&data.commit.author.date;
        if(committedAt)setReleaseTime(new Date(committedAt),'github');
      }
    }catch(error){}
  })();

  window.__siteVersion={setReleaseTime,setCommitDisplay};
})();

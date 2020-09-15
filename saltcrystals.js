

window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth(.96)
// a.hide()


  const video = document.createElement("video")
  video.autoplay = true
  video.crossOrigin = "anonymous"
  video.muted = true
  video.loop = true
  video.src = "./fotos/videos/saltcrystals_trim01.mp4"

  video.play().then(()=>s0.init({src:video, dynamic:true}))



src(s0)
.saturate(.4)
.contrast(1.3)
 .rotate(()=>a.fft[2]*2)
.scale(()=>a.fft[1]*.1+1)
// .kaleid(2)
// .modulate(o0, 0.01)
.rotate(({time})=>5.0+2*Math.sin(time*.03),.01)
.modulate((o2), ()=> a.fft[0]*2)
.blend(o0)
.out(o0)



shape(99,.15,.5).color(0,1,2)

.diff( shape(5,.5,0).scrollX(.05).scale( () => a.fft[3]*2+.8).rotate( () => a.fft[3]*4+4).color (() =>  .1 + mouse.x * 0.0005,0 + mouse.x * 0.0005),.5 + mouse.x * 0.0005).color(.1,.2,.5)
.diff( shape(3,.4,.002).scrollX(.10).scale( () => a.fft[1]*-2,.8).rotate( ()=> a.fft[1]*-1.2-2).rotate(() => Math.sin(time)+1*-2).color(.1,0,.5) )
.diff( shape(5,.3,.002).scrollX(.15).scale( () => a.fft[0]*2+.8).rotate( ()=> a.fft[3]*8+1).rotate(() => Math.sin(time)+3*2).color(.1,0.1,.5) )
.diff( shape(5,.2,.002).scrollX(.20).scale( () => a.fft[3]*-2+1.8).rotate( ()=>a.fft[3]*-4-4).rotate(() => Math.sin(time)-1*-2).color(.3,0,.3) )
.diff( shape(6,.1,.002).scrollX(.25).rotate( ()=>time/50 ).color(.1,0,.5) )

.modulateScale(
  shape(3,.5,0).scrollX(.05).rotate( ()=>time/10 )
  , ()=>(Math.sin(time/3)*.2)+.2 )
.scale(0.6, () => (1.05 + 0.1 * Math.sin(0.05*time)))
.scale(()=> 0.8 + mouse.y * 0.0014,.6,1)
.modulate(o2,.1)
.mult(gradient(({time})=>0.2+.2*Math.sin(time*.03),({time})=>0.05+1*Math.sin(time*.01),({time})=>0.3+2*Math.sin(time*.05)))



.out(o2)


src(o0)

.mult(o2,.8)
.modulateRotate(o0,.01)
.invert()

.out(o3)


render(o3)





}

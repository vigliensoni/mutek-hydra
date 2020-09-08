

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
.modulate((o2), ()=> a.ftt[0]*2)

.blend(o0)
// .(.2)


.out(o0)







shape(99,.15,.5).color(0,1,2)

.diff( shape(4,.5,0).scrollX(.05).rotate( () => a.fft[3]*4+4).color (() =>  .1 + mouse.x * 0.0005,0 + mouse.x * 0.0005),.5 + mouse.x * 0.0005)
.diff( shape(3,.4,.002).scrollX(.10).rotate( ()=> a.fft[1]*1+1).color(.1,0,.5) )
.diff( shape(5,.3,.002).scrollX(.15).rotate( ()=>time/30 ).color(.1,0,.5) )
.diff( shape(3,.2,.002).scrollX(.20).rotate( ()=>time/40 ).color(.1,0,.5) )
.diff( shape(6,.1,.002).scrollX(.25).rotate( ()=>time/50 ).color(.1,0,.5) )

.modulateScale(
  shape(3,.5,0).scrollX(.05).rotate( ()=>time/10 )
  , ()=>(Math.sin(time/3)*.2)+.2 )
.scale(0.8, () => (1.05 + 0.1 * Math.sin(0.05*time)))

.scale(()=> 0.5 + mouse.y * 0.0014,.6,1)

// .repeat( ()=>a.fft[0]*2+1, ()=>a.fft[1]*2+1)
//        // .layer(src(o2).mask(shape(4, 0.4, 0)))
//        .scrollX([0.05, -0.05])
//        .scrollY(0.05)


.out(o2)


src(o0)

.mult(o2,.8)
.modulateRotate(o0,.01)
.invert()

.out(o3)




render()

}




window.onload = function () {
  const hydra = new Hydra()


a.show();
a.setBins(4);
a.setSmooth(.96)
// a.hide()


let video = document.createElement("video")
video.autoplay = true
video.crossOrigin = "anonymous"
video.muted = true
video.loop = true
video.src = "./fotos/videos/copper_trimslowtrim.mp4"

video.play().then(()=>s0.init({src:video, dynamic:true}))

hush()


src(s0)
.scale(()=> a.fft[2]*.2+1)
.color(()=>Math.sin(time*0.03),()=>Math.sin(time*0.17),()=>Math.sin(time*0.07))
.rotate(()=>mouse.x*.0003+.000001,Math.sin(time) )
.color(()=>mouse.y * 0.001,()=>mouse.y * 0.0008)

// .modulateScale(noise(.8,.0031,.1))
.out(o0)




src(o0)
// voronoi(5.00, 0.16)
// diff(src(o3).scale(1.8)).modulateScale(osc(2).modulateRotate(o0, .74))
.diff(src(o3)
.scrollY(0, [-.0001, 0.1].fast(0.004)))
.brightness([-0.029, -.17].smooth().fast(0.21))
.out(o3)




render(o3)



}



// osc(4, ()=> a.fft[0]*.2-.1, 1)
// .scrollY( ()=>0.5 + mouse.y * 0.0014,.6,1)
// .repeat( ()=>a.fft[0]*2+1, ()=>a.fft[1]*2+1)
// .modulateRotate(o0,()=>a.fft[1]*.1+1)

// osc(({time})=>5.0+2*Math.sin(time*.03),.02,20)
// shape(()=>Math.sin(time)+1.2*3, .13,.01)
//   .repeat(5,3, ()=>a.fft[0]*2, ()=>a.fft[1]*2)
//   .scrollY(.5,0.1)



// OLIVIA'S TUBE
//
// src(s0)
// .blend(o0, 0.99)
// .scale(1.01)
// .out(o0)




// OLIVIA'S FEEDBACK

// osc(10, 0.1, 0.8)
//   .rotate(0, 0.1)
//   .kaleid()
//   .color(-1, 1)
// .out(o0)
//
//
//
// src(s0)
//   .color(-1, Math.random()*2, 1)
//   .colorama()
// .out(o1)
//
//
// src(o1)
//        .layer(src(o1).mask(shape(4, 0.4, 0)))
//        .scrollX([0.005, -0.005])
//        .scrollY(0.005)
// .out(o2)
//
//      render(o1)

// Offscreen numerical shader qualification; not a browser/UI acceptance test.
// CGL requires desktop GLSL 4.10. The JS driver changes only the version and precision declarations.
#define GL_SILENCE_DEPRECATION
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <cstdlib>

static GLuint compile(GLenum type,const std::string& source){
 GLuint shader=glCreateShader(type);const char* text=source.c_str();glShaderSource(shader,1,&text,nullptr);glCompileShader(shader);
 GLint okay=0;glGetShaderiv(shader,GL_COMPILE_STATUS,&okay);if(!okay){char log[8192];glGetShaderInfoLog(shader,sizeof(log),nullptr,log);std::cerr<<log;std::exit(2);}return shader;
}
int main(int argc,char**argv){
 if(argc<5){std::cerr<<"fragment output.ppm seconds width [uniform=value...]\n";return 1;}
 CGLPixelFormatAttribute attrs[]={kCGLPFAOpenGLProfile,(CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,kCGLPFAAllowOfflineRenderers,(CGLPixelFormatAttribute)0};
 CGLPixelFormatObj format;GLint count;CGLContextObj context;
 if(CGLChoosePixelFormat(attrs,&format,&count)!=kCGLNoError||!count){std::cerr<<"CGL format unavailable\n";return 3;}
 auto err=CGLCreateContext(format,nullptr,&context);CGLDestroyPixelFormat(format);if(err!=kCGLNoError){std::cerr<<CGLErrorString(err);return 3;}CGLSetCurrentContext(context);
 const int width=std::stoi(argv[4]),height=width*9/16;
 GLuint texture,fbo,vao;glGenTextures(1,&texture);glBindTexture(GL_TEXTURE_2D,texture);glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,width,height,0,GL_RGBA,GL_UNSIGNED_BYTE,nullptr);
 glGenFramebuffers(1,&fbo);glBindFramebuffer(GL_FRAMEBUFFER,fbo);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,texture,0);
 if(glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE){std::cerr<<"incomplete framebuffer";return 4;}
 std::ifstream file(argv[1]);std::stringstream source;source<<file.rdbuf();
 const std::string vertex="#version 410 core\nvoid main(){vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0);gl_Position=vec4(p,0,1);}";
 GLuint vs=compile(GL_VERTEX_SHADER,vertex),fs=compile(GL_FRAGMENT_SHADER,source.str()),program=glCreateProgram();glAttachShader(program,vs);glAttachShader(program,fs);glLinkProgram(program);
 GLint okay=0;glGetProgramiv(program,GL_LINK_STATUS,&okay);if(!okay){char log[8192];glGetProgramInfoLog(program,sizeof(log),nullptr,log);std::cerr<<log;return 2;}
 glUseProgram(program);glUniform2f(glGetUniformLocation(program,"uResolution"),width,height);glUniform1f(glGetUniformLocation(program,"uTime"),std::stof(argv[3]));
 glUniform1f(glGetUniformLocation(program,"uScale"),1);glUniform1f(glGetUniformLocation(program,"uRotation"),0);
 for(int i=5;i<argc;i++){
  std::string item=argv[i];auto split=item.find('=');std::string name=item.substr(0,split),value=item.substr(split+1);GLint location=glGetUniformLocation(program,name.c_str());
  if(location<0){std::cerr<<"inactive uniform "<<name;return 5;}
  if(value.find(',')!=std::string::npos){float a,b,c;char comma;std::istringstream values(value);values>>a>>comma>>b>>comma>>c;glUniform3f(location,a,b,c);}else glUniform1f(location,std::stof(value));
 }
 glGenVertexArrays(1,&vao);glBindVertexArray(vao);glViewport(0,0,width,height);glDrawArrays(GL_TRIANGLES,0,3);glFinish();
 auto start=std::chrono::steady_clock::now();for(int i=0;i<8;i++){glDrawArrays(GL_TRIANGLES,0,3);glFinish();}auto end=std::chrono::steady_clock::now();
 std::vector<unsigned char>pixels(width*height*3);glPixelStorei(GL_PACK_ALIGNMENT,1);glReadPixels(0,0,width,height,GL_RGB,GL_UNSIGNED_BYTE,pixels.data());
 if(glGetError()!=GL_NO_ERROR){std::cerr<<"GL error";return 6;}
 std::ofstream output(argv[2],std::ios::binary);output<<"P6\n"<<width<<" "<<height<<"\n255\n";for(int y=height-1;y>=0;y--)output.write((char*)pixels.data()+y*width*3,width*3);
 std::cout<<"{\"renderer\":\""<<glGetString(GL_RENDERER)<<"\",\"frame_ms\":"<<std::chrono::duration<double,std::milli>(end-start).count()/8<<"}\n";
 glDeleteShader(vs);glDeleteShader(fs);glDeleteProgram(program);glDeleteTextures(1,&texture);glDeleteFramebuffers(1,&fbo);glDeleteVertexArrays(1,&vao);CGLSetCurrentContext(nullptr);CGLDestroyContext(context);return 0;
}

"""Real bundled local CLI/MCP: no Studio, credentials, browser or mock engine."""
import hashlib
import json
from pathlib import Path
import subprocess

CLI = Path(__file__).parents[1] / 'aether_map_service/runtime/cli.mjs'

def cli(*args, data=None):
    run = subprocess.run(['node', str(CLI), *map(str,args)], input=json.dumps(data) if data is not None else None, capture_output=True, text=True, timeout=20)
    return json.loads(run.stdout)

def recipe():
    return {'version':1,'steps':[
        {'id':'scene','command':'map.scene.create','arguments':{'name':'Local agent scene','width_px':1280,'height_px':720}},
        {'id':'wall','command':'map.surface.create','arguments':{'scene_id':{'$ref':'scene.scene_id'},'name':'Wall'}},
        {'id':'visual','command':'map.visual.create','arguments':{'scene_id':{'$ref':'scene.scene_id'},'name':'Aurora','source_json':{'kind':'gallery','id':'aurora:0'}}},
    ],'assertions':[{'scene_id':{'$ref':'scene.scene_id'},'time_s':10,'layer_count':1}]}

def test_cli_builds_then_verifies_canonical_composition_and_refuses_stale_writes(tmp_path):
    file=tmp_path/'show.aethermap'
    first=cli('init','--file',file)
    assert first['created']
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(recipe())})
    assert result['changed'] and result['result']['assertions'][0]['passed']
    scene=result['result']['references']['scene']['scene_id']
    proof=cli('run','--file',file,'--command','map.show.verify',data={'scene_id':scene,'time_s':10})
    assert proof['result']['valid'] and proof['result']['layer_count']==1
    assert proof['result']['layers'][0]['shader']['preset']=='aurora'
    before=file.read_bytes()
    refused=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(recipe())})
    assert 'error' in refused and file.read_bytes()==before
    assert 'error' in cli('init','--file',file) and file.read_bytes()==before

def test_failed_program_saves_nothing_and_readonly_is_enforced(tmp_path):
    file=tmp_path/'show.aethermap'; first=cli('init','--file',file); before=file.read_bytes()
    program=recipe();program['assertions'][0]['layer_count']=9
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert 'assertion failed' in result['error'] and file.read_bytes()==before
    result=cli('run','--file',file,'--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(recipe())})
    assert '--write' in result['error'] and file.read_bytes()==before

def test_actual_mcp_protocol_discovery_execution_receipt_replay_and_readonly_catalog(tmp_path):
    file=tmp_path/'show.aethermap'; first=cli('init','--file',file)
    def request(id,method,params):return json.dumps({'jsonrpc':'2.0','id':id,'method':method,'params':params})
    call=request(3,'tools/call',{'name':'map_show_runprogram','arguments':{'program_json':json.dumps(recipe()),'expected_sha256':first['file_sha256']}})
    messages=[request(1,'initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'test','version':'1'}}),request(2,'tools/list',{}),call,call,request(4,'tools/call',{'name':'map_show_inspect','arguments':{}})]
    process=subprocess.run(['node',str(CLI),'mcp','--file',str(file),'--write'],input='\n'.join(messages)+'\n',text=True,capture_output=True,timeout=20)
    responses=[json.loads(line) for line in process.stdout.splitlines()]
    assert len(responses)==5, process.stderr
    assert responses[0]['result']['serverInfo']['name']=='aether-map'
    assert len(responses[1]['result']['tools'])==16
    assert responses[2]==responses[3]
    result=json.loads(responses[4]['result']['content'][0]['text'])
    assert len(result['result']['scenes'])==2
    assert hashlib.sha256(file.read_bytes()).hexdigest()==result['file_sha256']
    readonly=subprocess.run(['node',str(CLI),'mcp','--file',str(file)],input=request(1,'tools/list',{})+'\n',text=True,capture_output=True,timeout=20)
    tools=json.loads(readonly.stdout)['result']['tools']
    assert len(tools)==4 and all('expected_sha256' not in t['inputSchema']['properties'] for t in tools)

def test_local_commands_cannot_redirect_file_authority(tmp_path):
    file=tmp_path/'show.aethermap'; cli('init','--file',file)
    response=cli('run','--file',file,'--command','map.show.inspect',data={'id':'another-file'})
    assert 'authority' in response['error']
    link=tmp_path/'linked.aethermap';link.symlink_to(file)
    assert 'regular show file' in cli('inspect','--file',link)['error']

def test_full_visual_presets_store_in_cli_and_recall_atomically_through_mcp(tmp_path):
    file=tmp_path/'presets.aethermap';first=cli('init','--file',file)
    program=recipe();program['steps'][2]['arguments']['source_json']={'kind':'text','text':'Saved title','color':'#ff0000'}
    program['steps'].append({'id':'preset','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'opacity':.4,'effects':[{'kind':'blur','amount':30}],
        'source_motion':{'animation':{'color:text:hueDeg':[{'timeS':0,'value':120}]}},
        'preset':{'action':'store','slot':'A'},
    }}})
    stored=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert stored['changed'],stored
    refs=stored['result']['references'];visual=refs['visual']['clip_id'];scene=refs['scene']['scene_id']
    original=json.loads(file.read_text());look=next(v for v in original['visuals'] if v['id']==visual)['looks']['A'];assert original['version']==11
    changed=cli('run','--file',file,'--write','--command','map.visual.edit','--expected-sha256',stored['file_sha256'],data={'clip_id':visual,'changes_json':json.dumps({'opacity':1,'effects':[],'source':{'kind':'color','color':'#0000ff'}})})
    def request(id,name,args):return json.dumps({'jsonrpc':'2.0','id':id,'method':'tools/call','params':{'name':name,'arguments':args}})
    recall=request(1,'map_visual_edit',{'clip_id':visual,'changes_json':json.dumps({'preset':{'action':'recall','slot':'A'}}),'expected_sha256':changed['file_sha256']})
    proof=request(2,'map_show_verify',{'scene_id':scene,'time_s':2})
    process=subprocess.run(['node',str(CLI),'mcp','--file',str(file),'--write'],input='\n'.join([recall,recall,proof])+'\n',text=True,capture_output=True,timeout=20)
    responses=[json.loads(line) for line in process.stdout.splitlines()];assert len(responses)==3,process.stderr
    assert responses[0]==responses[1]
    result=json.loads(responses[2]['result']['content'][0]['text'])['result'];assert result['valid']
    layer=result['layers'][0];assert layer['opacity']==.4 and layer['source_parameters']['color:text:hueDeg']==120 and layer['effects'][0]['amount']==30
    restored=next(v for v in json.loads(file.read_text())['visuals'] if v['id']==visual)
    assert restored['source']==look['source'] and restored['effects']==look['effects'] and restored['looks']['A']==look
    before=file.read_bytes()
    refused=cli('run','--file',file,'--write','--command','map.visual.edit','--expected-sha256',hashlib.sha256(before).hexdigest(),data={'clip_id':visual,'changes_json':json.dumps({'opacity':.1,'preset':{'action':'recall','slot':'B'}})})
    assert 'error' in refused and file.read_bytes()==before

def test_body_modulation_is_available_to_bundled_agents_with_silent_offline_evaluation(tmp_path):
    file=tmp_path/'body.aethermap'; first=cli('init','--file',file)
    program=recipe();program['steps'][2]['arguments']['source_json']['id']='neon-beams:0'
    program['steps'].append({'id':'motion','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'shader':{'modulation':{'glow':{'source':'body','bodySignal':'leftHand','range':{'min':.2,'max':2}}}},
        'effects':[{'kind':'zoom','amount':0,'modulation':{'source':'body','bodySignal':'spread','range':{'min':0,'max':100}}}],
    }}})
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert result['changed'],result
    refs=result['result']['references'];saved=json.loads(file.read_text());visual=next(v for v in saved['visuals'] if v['id']==refs['visual']['clip_id'])
    assert visual['source']['shader']['modulation']['glow']['bodySignal']=='leftHand'
    assert visual['effects'][0]['modulation']['bodySignal']=='spread'
    proof=cli('run','--file',file,'--command','map.show.evaluate',data={'scene_id':refs['scene']['scene_id'],'time_s':0})
    layer=proof['result']['layers'][0]
    assert layer['evaluated_shader']['glow']==.2 and layer['effects'][0]['amount']==0
    assert 'body tracking' in proof['result']['live_inputs']

def test_stage_generators_are_discoverable_and_authorable_in_packaged_agent(tmp_path):
    file=tmp_path/'stage.aethermap';first=cli('init','--file',file)
    discovery=cli('run','--file',file,'--command','map.agent.docs',data={'topic':'gallery','query':'fireworks'})
    assert discovery['result']['items'][0]['id']=='fireworks:0'
    loops=cli('run','--file',file,'--command','map.agent.docs',data={'topic':'gallery','query':'video loops'})
    assert len(loops['result']['bundled_video_loops'])==6
    assert loops['result']['items']==[]
    assert 'not procedural gallery source IDs' in loops['result']['video_loop_workflow']
    program=recipe();program['steps'][2]['arguments']['source_json']['id']='fireworks:0'
    program['steps'].append({'id':'motion','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'shader':{'animation':{'gravity':[{'timeS':0,'value':0},{'timeS':4,'value':1}]}},
    }}})
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert result['changed'],result
    refs=result['result']['references']
    proof=cli('run','--file',file,'--command','map.show.evaluate',data={'scene_id':refs['scene']['scene_id'],'time_s':2})
    assert proof['result']['layers'][0]['evaluated_shader']['gravity']==.5
    saved=next(v for v in json.loads(file.read_text())['visuals'] if v['id']==refs['visual']['clip_id'])
    assert saved['source']['shader']['preset']=='fireworks'


def test_visual_motion_roundtrips_and_evaluates_in_the_packaged_cli(tmp_path):
    file=tmp_path/'motion.aethermap'; first=cli('init','--file',file)
    program=recipe()
    program['steps'].append({'id':'motion','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'motion':{'animation':{'opacityPercent':[{'timeS':0,'value':0},{'timeS':4,'value':100}],
                               'xPercent':[{'timeS':0,'value':20},{'timeS':4,'value':80}]},
                  'modulation':{'rotationDeg':{'source':'body','bodySignal':'lean','range':{'min':-30,'max':30}}}},
    }}})
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert result['changed'],result
    refs=result['result']['references'];saved=json.loads(file.read_text())
    assert saved['version']==8
    proof=cli('run','--file',file,'--command','map.show.evaluate',data={'scene_id':refs['scene']['scene_id'],'time_s':2})
    layer=proof['result']['layers'][0]
    assert layer['opacity']==.5 and layer['placement']['xPercent']==50 and layer['placement']['rotationDeg']==-30
    inspect=cli('inspect','--file',file)
    visual=next(v for v in inspect['result']['clips'] if v['id']==refs['visual']['clip_id'])
    assert len(visual['motion']['animation']['opacityPercent'])==2
    before=file.read_bytes()
    bad=cli('run','--file',file,'--write','--command','map.visual.edit','--expected-sha256',result['file_sha256'],data={'clip_id':visual['id'],'changes_json':json.dumps({'motion':{'animation':{'opacityPercent':[{'timeS':0,'value':101}]}}})})
    assert 'error' in bad and file.read_bytes()==before


def test_packaged_agent_creates_cube_poses_all_faces_and_preserves_saved_identity(tmp_path):
    file = tmp_path / 'cube.aethermap'
    first = cli('init', '--file', file)
    program = recipe()
    program['steps'][1]['arguments']['shape'] = 'cube'
    program['steps'].append({'id': 'pose', 'command': 'map.cube.pose', 'arguments': {
        'scene_id': {'$ref': 'scene.scene_id'}, 'surface_id': {'$ref': 'wall.surface_id'},
        'mode': 'rotate', 'x_degrees': 12, 'z_degrees': 3,
    }})
    program['assertions'][0]['layer_count'] = 3
    result = cli('run', '--file', file, '--write', '--command', 'map.show.runprogram',
                 '--expected-sha256', first['file_sha256'], data={'program_json': json.dumps(program)})
    assert result['changed'], result
    refs = result['result']['references']
    scene_id = refs['scene']['scene_id']
    surface_id = refs['wall']['surface_id']
    before = json.loads(file.read_text())
    faces = next(s for s in before['scenes'] if s['id'] == scene_id)['surfaces']
    assert len(faces) == 3 and all(s['groupShape'] == 'cube' for s in faces)
    command = {'scene_id': scene_id, 'surface_id': surface_id, 'mode': 'inside-out'}
    readonly = cli('run', '--file', file, '--command', 'map.cube.pose', data=command)
    assert 'error' in readonly and json.loads(file.read_text()) == before
    inside = cli('run', '--file', file, '--write', '--command', 'map.cube.pose',
                 '--expected-sha256', result['file_sha256'], data=command)
    assert inside['changed'], inside
    changed = next(s for s in inside['result']['scenes'] if s['id'] == scene_id)['surfaces']
    assert [s['id'] for s in changed] == [s['id'] for s in faces]
    assert all(a['corners'] != b['corners'] for a, b in zip(changed, faces))
    proof = cli('run', '--file', file, '--command', 'map.show.verify', data={'scene_id': scene_id, 'time_s': 2})
    assert proof['result']['valid'] and proof['result']['layer_count'] == 3
    saved = file.read_bytes()
    refused = cli('run', '--file', file, '--write', '--command', 'map.cube.pose',
                  '--expected-sha256', inside['file_sha256'], data={**command, 'x_degrees': 0})
    assert 'error' in refused and file.read_bytes() == saved


def test_source_motion_roundtrips_and_evaluates_through_the_actual_cli(tmp_path):
    file=tmp_path/'source-motion.aethermap'; first=cli('init','--file',file)
    program=recipe();program['steps'][2]['arguments']['source_json']={'kind':'text','text':'Source motion'}
    program['steps'].append({'id':'motion','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'source_parameters':{'textSizePx':80},
        'source_motion':{'animation':{'textSizePx':[{'timeS':0,'value':20},{'timeS':4,'value':100}]},
                         'modulation':{'textLineHeight':{'source':'midi','control':17,'range':{'min':1,'max':3}}}},
    }}})
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert result['changed'],result
    refs=result['result']['references'];saved=json.loads(file.read_text())
    assert saved['version']==9
    proof=cli('run','--file',file,'--command','map.show.evaluate',data={'scene_id':refs['scene']['scene_id'],'time_s':2})
    assert proof['result']['layers'][0]['source_parameters']['textSizePx']==60
    assert proof['result']['layers'][0]['source_parameters']['textLineHeight']==1
    inspect=cli('inspect','--file',file);visual=next(v for v in inspect['result']['clips'] if v['id']==refs['visual']['clip_id'])
    assert visual['source_parameters']['textSizePx']==80
    assert len(visual['source_motion']['animation']['textSizePx'])==2
    before=file.read_bytes()
    bad=cli('run','--file',file,'--write','--command','map.visual.edit','--expected-sha256',result['file_sha256'],data={'clip_id':visual['id'],'changes_json':json.dumps({'source_parameters':{'cropLeftPx':50}})})
    assert 'error' in bad and file.read_bytes()==before


def test_color_and_named_choice_motion_roundtrip_in_actual_cli(tmp_path):
    file=tmp_path/'color-motion.aethermap'; first=cli('init','--file',file)
    program=recipe();program['steps'][2]['arguments']['source_json']={'kind':'text','text':'Color motion','color':'#ff0000'}
    program['steps'].append({'id':'motion','command':'map.visual.edit','arguments':{'clip_id':{'$ref':'visual.clip_id'},'changes_json':{
        'source_motion':{'animation':{
            'color:text:hueDeg':[{'timeS':0,'value':0},{'timeS':4,'value':240}],
            'choice:textAlign':[{'timeS':0,'value':0},{'timeS':4,'value':2}],
        }},
    }}})
    result=cli('run','--file',file,'--write','--command','map.show.runprogram','--expected-sha256',first['file_sha256'],data={'program_json':json.dumps(program)})
    assert result['changed'],result
    refs=result['result']['references'];assert json.loads(file.read_text())['version']==10
    proof=cli('run','--file',file,'--command','map.show.evaluate',data={'scene_id':refs['scene']['scene_id'],'time_s':2})
    values=proof['result']['layers'][0]['source_parameters'];assert values['color:text:hueDeg']==120 and values['choice:textAlign']==0
    inspect=cli('inspect','--file',file);visual=next(v for v in inspect['result']['clips'] if v['id']==refs['visual']['clip_id'])
    spec=next(s for s in visual['source_parameter_specs'] if s['key']=='choice:textAlign');assert spec['options']==['Left','Center','Right','Justify'] and spec['interpolation']=='hold'
    before=file.read_bytes()
    bad=cli('run','--file',file,'--write','--command','map.visual.edit','--expected-sha256',result['file_sha256'],data={'clip_id':visual['id'],'changes_json':json.dumps({'source_parameters':{'choice:textAlign':.5}})})
    assert 'error' in bad and file.read_bytes()==before


def test_surface_motion_cli_mcp_roundtrip_evaluation_and_atomic_refusal(tmp_path):
    file = tmp_path / 'surfaces.aethermap'
    first = cli('init', '--file', file)
    program = recipe()
    program['steps'].append({'id': 'target', 'command': 'map.visual.edit', 'arguments': {
        'clip_id': {'$ref': 'visual.clip_id'}, 'changes_json': {
            'targets': [{'scene_id': {'$ref': 'scene.scene_id'}, 'surface_id': {'$ref': 'wall.surface_id'}}],
        },
    }})
    made = cli('run', '--file', file, '--write', '--command', 'map.show.runprogram',
               '--expected-sha256', first['file_sha256'], data={'program_json': json.dumps(program)})
    refs = made['result']['references']
    args = {'scene_id': refs['scene']['scene_id'], 'surface_id': refs['wall']['surface_id'],
            'changes_json': json.dumps({'bend_axis': 'vertical',
                'animation': {'radiusPx': [{'timeS': 0, 'value': 0}, {'timeS': 4, 'value': 40}],
                              'bendAngleDeg': [{'timeS': 0, 'value': 0}, {'timeS': 4, 'value': 120}]},
                'modulation': {'opacity': {'source': 'midi', 'range': {'min': .2, 'max': .8}}}})}
    edited = cli('run', '--file', file, '--write', '--command', 'map.surface.animate',
                 '--expected-sha256', made['file_sha256'], data=args)
    assert edited['changed'] and json.loads(file.read_text())['version'] == 12
    proof = cli('run', '--file', file, '--command', 'map.show.evaluate',
                data={'scene_id': args['scene_id'], 'time_s': 2})
    layer = proof['result']['layers'][0]
    assert layer['opacity'] == .2 and layer['radius_px'] == 20
    assert layer['bend'] == {'axis': 'vertical', 'angleDeg': 60}
    before = file.read_bytes()
    bad = {**args, 'changes_json': json.dumps({'bases': {'opacity': .1}, 'modulation': {'xPx': {'source': 'invalid'}}})}
    assert 'error' in cli('run', '--file', file, '--write', '--command', 'map.surface.animate', '--expected-sha256', edited['file_sha256'], data=bad)
    assert file.read_bytes() == before
    request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {
        'name': 'map_surface_animate', 'arguments': {**args,
            'changes_json': json.dumps({'modulation': None}), 'expected_sha256': edited['file_sha256']}}}
    process = subprocess.run(['node', str(CLI), 'mcp', '--file', str(file), '--write'],
                             input=json.dumps(request)+'\n', text=True, capture_output=True, timeout=20)
    response = json.loads(process.stdout)
    assert not response['result'].get('isError'), response
    saved = json.loads(file.read_text())
    surface = next(s for scene in saved['scenes'] for s in scene['surfaces'] if s['id'] == args['surface_id'])
    assert 'modulation' not in surface and surface['animation']['radiusPx'][1]['value'] == 40

/* Chinese localization: team names and player names (curated table + transliteration). */
(function (root) {
  'use strict';

  const TEAM = {
    ATL: ['亚特兰大老鹰', '老鹰'], BOS: ['波士顿凯尔特人', '凯尔特人'], BKN: ['布鲁克林篮网', '篮网'],
    CHA: ['夏洛特黄蜂', '黄蜂'], CHI: ['芝加哥公牛', '公牛'], CLE: ['克利夫兰骑士', '骑士'],
    DAL: ['达拉斯独行侠', '独行侠'], DEN: ['丹佛掘金', '掘金'], DET: ['底特律活塞', '活塞'],
    GSW: ['金州勇士', '勇士'], HOU: ['休斯顿火箭', '火箭'], IND: ['印第安纳步行者', '步行者'],
    LAC: ['洛杉矶快船', '快船'], LAL: ['洛杉矶湖人', '湖人'], MEM: ['孟菲斯灰熊', '灰熊'],
    MIA: ['迈阿密热火', '热火'], MIL: ['密尔沃基雄鹿', '雄鹿'], MIN: ['明尼苏达森林狼', '森林狼'],
    NOP: ['新奥尔良鹈鹕', '鹈鹕'], NYK: ['纽约尼克斯', '尼克斯'], OKC: ['俄克拉荷马城雷霆', '雷霆'],
    ORL: ['奥兰多魔术', '魔术'], PHI: ['费城76人', '76人'], PHX: ['菲尼克斯太阳', '太阳'],
    POR: ['波特兰开拓者', '开拓者'], SAC: ['萨克拉门托国王', '国王'], SAS: ['圣安东尼奥马刺', '马刺'],
    TOR: ['多伦多猛龙', '猛龙'], UTA: ['犹他爵士', '爵士'], WAS: ['华盛顿奇才', '奇才'],
  };

  // Established Chinese renderings for names a transliterator would mangle.
  const FULL = {
    'Luka Doncic': '卢卡·东契奇', 'Nikola Jokic': '尼古拉·约基奇', 'Stephen Curry': '斯蒂芬·库里',
    'Victor Wembanyama': '维克托·文班亚马', 'Shai Gilgeous-Alexander': '谢伊·吉尔杰斯-亚历山大',
    'Giannis Antetokounmpo': '扬尼斯·阿德托昆博', 'Donovan Mitchell': '多诺万·米切尔',
    'Joel Embiid': '乔尔·恩比德', 'Kawhi Leonard': '科怀·伦纳德', 'Anthony Davis': '安东尼·戴维斯',
    'Jayson Tatum': '杰森·塔图姆', 'Tyrese Haliburton': '泰瑞斯·哈利伯顿', 'Tyrese Maxey': '泰瑞斯·马克西',
    'Lauri Markkanen': '劳里·马尔卡宁', 'LaMelo Ball': '拉梅洛·鲍尔', 'Anthony Edwards': '安东尼·爱德华兹',
    'Michael Porter Jr.': '小迈克尔·波特', 'Jamal Murray': '贾马尔·穆雷', 'Jimmy Butler III': '吉米·巴特勒',
    'Paul George': '保罗·乔治', 'Cade Cunningham': '凯德·坎宁安', 'Franz Wagner': '弗朗茨·瓦格纳',
    'Jaylen Brown': '杰伦·布朗', 'Ja Morant': '贾·莫兰特', 'Trae Young': '特雷·杨',
    'James Harden': '詹姆斯·哈登', 'Jalen Brunson': '杰伦·布伦森', 'Devin Booker': '德文·布克',
    'Deni Avdija': '德尼·阿夫迪亚', 'Jalen Johnson': '杰伦·约翰逊', 'Kyrie Irving': '凯里·欧文',
    'Kevin Durant': '凯文·杜兰特', 'Austin Reaves': '奥斯汀·里夫斯', 'Trey Murphy III': '特雷·墨菲',
    'Jalen Williams': '杰伦·威廉姆斯', 'Domantas Sabonis': '多曼塔斯·萨博尼斯', 'Keyonte George': '基扬特·乔治',
    'Nickeil Alexander-Walker': '尼基尔·亚历山大-沃克', 'Brandon Miller': '布兰登·米勒',
    'Norman Powell': '诺曼·鲍威尔', 'Pascal Siakam': '帕斯卡尔·西亚卡姆', 'Bam Adebayo': '巴姆·阿德巴约',
    'Tyler Herro': '泰勒·希罗', 'Jalen Green': '杰伦·格林', 'Zach LaVine': '扎克·拉文',
    'Grayson Allen': '格雷森·阿伦', 'Darius Garland': '达柳斯·加兰', 'Karl-Anthony Towns': '卡尔-安东尼·唐斯',
    'LeBron James': '勒布朗·詹姆斯', 'Kon Knueppel': '康·克努佩尔', 'Josh Giddey': '乔什·吉迪',
    "De'Aaron Fox": '德阿隆·福克斯', 'CJ McCollum': 'CJ·麦科勒姆', 'Derrick White': '德里克·怀特',
    'Julius Randle': '朱利叶斯·兰德尔', 'Coby White': '科比·怀特', 'Aaron Gordon': '阿隆·戈登',
    'Kristaps Porzingis': '克里斯塔普斯·波尔津吉斯', 'Paolo Banchero': '保罗·班凯罗',
    'Shaedon Sharpe': '谢登·夏普', 'Immanuel Quickley': '伊曼纽尔·奎克利', 'Payton Pritchard': '佩顿·普里查德',
    'Evan Mobley': '埃文·莫布利', 'Cooper Flagg': '库珀·弗拉格', 'Jalen Duren': '杰伦·杜伦',
    'Alperen Sengun': '阿尔佩伦·申京', 'Walker Kessler': '沃克·凯斯勒', 'Chet Holmgren': '切特·霍姆格伦',
    'Jrue Holiday': '朱·霍勒迪', 'RJ Barrett': 'RJ·巴雷特', 'Jaren Jackson Jr.': '小贾伦·杰克逊',
    'Andrew Nembhard': '安德鲁·内姆哈德', 'Brandon Ingram': '布兰登·英格拉姆', 'Ryan Rollins': '瑞安·罗林斯',
    'Saddiq Bey': '萨迪克·贝', 'Dejounte Murray': '德章泰·穆雷', 'Jordan Poole': '乔丹·普尔',
    'Desmond Bane': '德斯蒙德·贝恩', 'Jalen Suggs': '杰伦·萨格斯', 'Dillon Brooks': '狄龙·布鲁克斯',
    'Scottie Barnes': '斯科蒂·巴恩斯', 'Alex Sarr': '亚历克斯·萨尔', 'Onyeka Okongwu': '奥涅卡·奥孔古',
    'Matas Buzelis': '马塔斯·布泽利斯', 'Reed Sheppard': '里德·谢泼德', 'Fred VanVleet': '弗雷德·范弗利特',
    'Jerami Grant': '杰拉米·格兰特', 'Zion Williamson': '锡安·威廉姆森', 'Nikola Vucevic': '尼古拉·武切维奇',
    'Miles Bridges': '迈尔斯·布里奇斯', 'Stephon Castle': '斯蒂芬·卡斯尔', 'Naz Reid': '纳兹·里德',
    'Santi Aldama': '桑蒂·阿尔达马', 'DeMar DeRozan': '德玛尔·德罗赞', 'Obi Toppin': '奥比·托平',
    'Collin Sexton': '科林·塞克斯顿', 'Ayo Dosunmu': '阿约·多森穆', 'OG Anunoby': 'OG·阿努诺比',
    'Anfernee Simons': '安芬尼·西蒙斯', 'Collin Gillespie': '科林·吉莱斯皮', 'Donovan Clingan': '多诺万·克林根',
    'Keegan Murray': '基根·穆雷', 'Brice Sensabaugh': '布里斯·森萨博', 'Kyshawn George': '基肖恩·乔治',
    'Tre Jones': '特雷·琼斯', 'Sam Merrill': '山姆·梅里尔', 'Paul Reed': '保罗·里德',
    'Brandin Podziemski': '布兰丁·波杰姆斯基', 'Cam Spencer': '卡姆·斯宾塞', 'Bobby Portis': '博比·波蒂斯',
    'Andrew Wiggins': '安德鲁·威金斯', "Kel'el Ware": '凯尔·韦尔', 'Donte DiVincenzo': '丹特·迪文琴佐',
    'Bennedict Mathurin': '本内迪克特·马图林', 'Mikal Bridges': '米卡尔·布里奇斯', 'VJ Edgecombe': 'VJ·埃奇科姆',
    'Jarrett Allen': '贾雷特·阿伦', 'Isaiah Joe': '伊萨亚·乔', 'Jabari Smith Jr.': '小贾巴里·史密斯',
    'Amen Thompson': '阿门·汤普森', 'T.J. McConnell': 'TJ·麦康奈尔', 'Sandro Mamukelashvili': '桑德罗·马穆克拉什维利',
    'Cedric Coward': '塞德里克·考沃德', 'Jonathan Kuminga': '乔纳森·库明加', 'Ajay Mitchell': '阿杰·米切尔',
    'Anthony Black': '安东尼·布莱克', 'Scoot Henderson': '斯库特·亨德森', 'Malik Monk': '马利克·蒙克',
    'Devin Vassell': '德文·瓦塞尔', 'Tristan Vukcevic': '特里斯坦·武克切维奇', 'Jalen Smith': '杰伦·史密斯',
    'Duncan Robinson': '邓肯·罗宾逊', "De'Anthony Melton": '德安东尼·梅尔顿', 'Moses Moody': '摩西·穆迪',
    'GG Jackson': 'GG·杰克逊', 'Tim Hardaway Jr.': '小蒂姆·哈达威', 'Klay Thompson': '克莱·汤普森',
    'Jaime Jaquez Jr.': '小海梅·哈克斯', 'Myles Turner': '迈尔斯·特纳', 'Yaxel Lendeborg': '亚克塞尔·伦德伯格',
    'Rudy Gobert': '鲁迪·戈贝尔', 'Julius Randle': '朱利叶斯·兰德尔', 'Deandre Ayton': '德安德烈·艾顿',
    'Jusuf Nurkic': '尤素夫·努尔基奇', 'Jonas Valanciunas': '约纳斯·瓦兰丘纳斯',
    'Nikola Jovic': '尼古拉·约维奇', 'Bogdan Bogdanovic': '博格丹·博格达诺维奇',
    'Dennis Schroder': '丹尼斯·施罗德', 'Franz Wagner': '弗朗茨·瓦格纳', 'Moritz Wagner': '莫里茨·瓦格纳',
    'Lauri Markkanen': '劳里·马尔卡宁', 'Kristaps Porzingis': '克里斯塔普斯·波尔津吉斯',
    'Deni Avdija': '德尼·阿夫迪亚', 'Rui Hachimura': '八村塁', 'Yuki Kawamura': '河村勇辉',
    'AJ Dybantsa': 'AJ·迪班萨', 'Jaylon Tyson': '贾伦·泰森', 'Jeremiah Fears': '杰里迈亚·菲尔斯',
    'Micah Potter': '米卡·波特', 'Quentin Grimes': '昆汀·格拉姆斯', 'Olivier-Maxence Prosper': '奥利维耶-马克森斯·普罗斯珀',
    'Bones Hyland': '博恩斯·海兰德', 'Javon Small': '贾文·斯莫尔', 'Ace Bailey': '埃斯·贝利',
    'P.J. Washington': 'PJ·华盛顿', 'Dylan Harper': '迪伦·哈珀', 'Toumani Camara': '图马尼·卡马拉',
    'Max Strus': '马克斯·斯特鲁斯', 'Kyle Filipowski': '凯尔·菲利波夫斯基', 'Naji Marshall': '纳吉·马歇尔',
    'Darryn Peterson': '达林·彼得森', 'Caleb Wilson': '凯莱布·威尔逊', 'Cameron Boozer': '卡梅隆·布泽尔',
    'Keaton Wagler': '基顿·瓦格勒', 'Mikel Brown Jr.': '小米克尔·布朗', 'Darius Acuff Jr.': '小达里乌斯·阿卡夫',
    'Kingston Flemings': '金斯顿·弗莱明斯', 'Brayden Burries': '布雷登·伯里斯', 'Hannes Steinbach': '汉内斯·施泰因巴赫',
    'Nate Ament': '内特·阿门特', 'Thomas Sorber': '托马斯·索伯', 'Labaron Philon': '拉巴伦·菲隆',
    'Isaiah Evans': '伊萨亚·埃文斯', 'Carter Bryant': '卡特·布莱恩特', 'Will Riley': '威尔·莱利',
    'Joan Beringer': '若安·贝林杰', 'Noa Essengue': '诺阿·埃森格', 'Yang Hansen': '杨瀚森',

  };

  // Common first names
  const FIRST = {
    aaron: '亚伦', al: '艾尔', egor: '叶戈尔', adam: '亚当', aj: 'AJ', ajay: '阿杰', alex: '亚历克斯', alexander: '亚历山大',
    amari: '阿马里', amen: '阿门', andre: '安德烈', andrew: '安德鲁', anfernee: '安芬尼', anthony: '安东尼',
    austin: '奥斯汀', ayo: '阿约', bam: '巴姆', ben: '本', benedict: '本尼迪克特', bennedict: '本内迪克特',
    bobby: '博比', bogdan: '博格丹', brandin: '布兰丁', brandon: '布兰登', brice: '布里斯', brook: '布鲁克',
    bruce: '布鲁斯', buddy: '巴迪', cade: '凯德', bub: '巴布', cam: '卡姆', cameron: '卡梅伦', caris: '卡里斯',
    carl: '卡尔', cedric: '塞德里克', charles: '查尔斯', chet: '切特', chris: '克里斯', christian: '克里斯蒂安',
    cj: 'CJ', coby: '科比', cason: '卡森', cody: '科迪', colby: '科尔比', cole: '科尔', collin: '科林', corey: '科里',
    dalano: '达拉诺', damian: '达米安', damion: '达米恩', darius: '达柳斯', darryn: '达林', david: '大卫',
    davion: '达维恩', dayron: '戴龙', deandre: '德安德烈', dean: '迪恩', demar: '德玛尔', deni: '德尼',
    dennis: '丹尼斯', derrick: '德里克', desmond: '德斯蒙德', devin: '德文', deanthony: '德安东尼',
    domantas: '多曼塔斯', donovan: '多诺万', donte: '丹特', dorian: '多里安', doug: '道格', draymond: '德雷蒙德',
    drew: '德鲁', duncan: '邓肯', dustin: '达斯汀', dwight: '德怀特', dyson: '戴森', eddie: '埃迪',
    elijah: '伊莱贾', elliot: '埃利奥特', eric: '埃里克', evan: '埃文', franz: '弗朗茨', fred: '弗雷德',
    gabe: '盖布', gary: '加里', gg: 'GG', goga: '戈加', grayson: '格雷森', gui: '吉', haywood: '海伍德',
    herb: '赫布', immanuel: '伊曼纽尔', isaac: '艾萨克', isaiah: '伊萨亚', ivica: '伊维察', jabari: '贾巴里',
    jack: '杰克', jacob: '雅各布', jaime: '海梅', jake: '杰克', jalen: '杰伦', jamal: '贾马尔', james: '詹姆斯',
    jaren: '贾伦', jared: '贾里德', jaren: '贾伦', jase: '杰斯', javon: '贾文', jaylen: '杰伦', jayson: '杰森',
    jeff: '杰夫', jerami: '杰拉米', jeremy: '杰里米', jett: '杰特', jimmy: '吉米', joel: '乔尔', john: '约翰',
    johnny: '约翰尼', jonas: '约纳斯', jonathan: '乔纳森', jordan: '乔丹', jose: '何塞', josh: '乔什',
    joshua: '约书亚', jrue: '朱', julian: '朱利安', julius: '朱利叶斯', juri: '尤里', justin: '贾斯汀',
    jusuf: '尤素夫', kai: '凯', kawhi: '科怀', keegan: '基根', keion: '凯昂', keldon: '凯尔登', kelly: '凯利',
    kenny: '肯尼', kentavious: '肯塔维厄斯', keon: '基昂', keshad: '凯沙德', kevin: '凯文', keyonte: '基扬特',
    khaman: '哈曼', kobe: '科比', kobi: '科比', kon: '康', kris: '克里斯', kristaps: '克里斯塔普斯',
    kyle: '凯尔', kyle: '凯尔', kyrie: '凯里', lamelo: '拉梅洛', landry: '兰德里', larry: '拉里', lauri: '劳里',
    lebron: '勒布朗', liam: '利亚姆', lonzo: '朗佐', luka: '卢卡', luke: '卢克', malik: '马利克', marc: '马克',
    marcus: '马库斯', mark: '马克', markelle: '马克尔', marvin: '马文', matas: '马塔斯', matisse: '马蒂斯',
    matt: '马特', max: '马克斯', maxime: '马克西姆', melvin: '梅尔文', micah: '迈卡', michael: '迈克尔',
    mikal: '米卡尔', mike: '迈克', miles: '迈尔斯', mitchell: '米切尔', moritz: '莫里茨', moses: '摩西',
    myles: '迈尔斯', nate: '内特', naz: '纳兹', neemias: '内米亚斯', nicolas: '尼古拉斯', nigel: '奈杰尔',
    nikola: '尼古拉', noah: '诺亚', norman: '诺曼', obi: '奥比', ochai: '奥柴', og: 'OG', onyeka: '奥涅卡',
    oscar: '奥斯卡', otto: '奥托', pablo: '巴勃罗', pascal: '帕斯卡尔', pat: '帕特', patrick: '帕特里克',
    patty: '帕蒂', paul: '保罗', payton: '佩顿', peyton: '佩顿', quinten: '昆汀', rj: 'RJ', rui: '八村',
    rudy: '鲁迪', russell: '拉塞尔', ryan: '瑞安', saddiq: '萨迪克', sam: '山姆', sandro: '桑德罗',
    santi: '桑蒂', scooter: '斯库特', scottie: '斯科蒂', sean: '肖恩', seth: '塞斯', shaedon: '谢登', robert: '罗伯特',
    shai: '谢伊', shannon: '香农', shaun: '肖恩', sidy: '西迪', spencer: '斯宾塞', steph: '斯蒂芬',
    stephen: '斯蒂芬', stephon: '斯蒂芬', steve: '史蒂夫', terance: '特伦斯', terry: '特里', thanasis: '萨纳西斯',
    theo: '西奥', thomas: '托马斯', tidjane: '蒂贾内', tim: '蒂姆', tj: 'TJ', tobias: '托拜厄斯', todd: '托德', ty: '泰', yannick: '扬尼克', henri: '亨利',
    torey: '托里', torrey: '托里', trae: '特雷', tre: '特雷', trey: '特雷', tristan: '特里斯坦', troy: '特洛伊',
    tyler: '泰勒', tyrese: '泰瑞斯', tyshawn: '蒂肖恩', tyus: '泰厄斯', vasilije: '瓦西里耶', victor: '维克托',
    vincent: '文森特', vj: 'VJ', vlatko: '弗拉特科', wendell: '温德尔', wes: '韦斯', xavier: '泽维尔',
    zach: '扎克', zaccharie: '扎卡里', zeke: '齐克', ziaire: '齐艾尔', zion: '锡安', zone: '佐恩',
  };

  // Common surnames
  const LAST = {
    adebayo: '阿德巴约', achiuwa: '阿丘瓦', adams: '亚当斯', aldama: '阿尔达马', allen: '阿伦',
    alvarado: '阿尔瓦拉多', anderson: '安德森', anunoby: '阿努诺比', avdija: '阿夫迪亚', ayton: '艾顿',
    bagley: '巴格利', bailey: '贝利', ball: '鲍尔', bamba: '班巴', banchero: '班凯罗', bane: '贝恩',
    barnes: '巴恩斯', barrett: '巴雷特', bassey: '巴西', battle: '巴特尔', beal: '比尔', bey: '贝',
    bickerstaff: '比克斯塔夫', bilodeau: '比洛多', bitadze: '比塔泽', black: '布莱克', bogdanovic: '博格达诺维奇',
    bona: '博纳', booker: '布克', boozer: '布泽尔', bradley: '布拉德利', braun: '布劳恩', bridges: '布里奇斯',
    brooks: '布鲁克斯', brown: '布朗', brunson: '布伦森', bryant: '布莱恩特', butler: '巴特勒',
    buzelis: '布泽利斯', camara: '卡马拉', capela: '卡佩拉', carr: '卡尔', carrington: '卡林顿',
    carter: '卡特', caruso: '卡鲁索', castle: '卡斯尔', castleton: '卡斯尔顿', champagnie: '尚帕尼',
    christie: '克里斯蒂', claxton: '克拉克斯顿', clowney: '克劳尼', clayton: '克莱顿', clifford: '克利福德', clingan: '克林根',
    collier: '科利尔', collins: '科林斯', conley: '康利', cooper: '库珀', coulibaly: '库利巴利', coward: '考沃德',
    crawford: '克劳福德', cunningham: '坎宁安', curry: '库里', daniels: '丹尼尔斯', davis: '戴维斯',
    demin: '杰明', dennis: '丹尼斯', diabate: '迪亚巴特', diallo: '迪亚洛', dick: '迪克', dieng: '迪昂',
    doncic: '东契奇', dort: '多尔特', dosunmu: '多森穆', drummond: '德拉蒙德', dunn: '邓恩', durant: '杜兰特',
    duren: '杜伦', dyson: '戴森', eason: '伊森', edey: '伊迪', edgecombe: '埃奇科姆', edwards: '爱德华兹',
    ellis: '埃利斯', embiid: '恩比德', evans: '埃文斯', fall: '法尔', fears: '菲尔斯', filipowski: '菲利波夫斯基',
    flagg: '弗拉格', fleming: '弗莱明', flemings: '弗莱明斯', fox: '福克斯', gafford: '加福德', garland: '加兰',
    garza: '加尔萨', george: '乔治', giddey: '吉迪', gill: '吉尔', gillespie: '吉莱斯皮', gobert: '戈贝尔',
    goldin: '戈尔丁', gonzalez: '冈萨雷斯', goodwin: '古德温', gordon: '戈登', grant: '格兰特', green: '格林',
    grimes: '格拉姆斯', gueye: '盖耶', hachimura: '八村', haliburton: '哈利伯顿', hall: '霍尔', hardaway: '哈达威',
    harden: '哈登', hardy: '哈迪', harper: '哈珀', harris: '哈里斯', hart: '哈特', hartenstein: '哈尔滕施泰因',
    hauser: '豪泽', hawkins: '霍金斯', hayes: '海耶斯', henderson: '亨德森', hendricks: '亨德里克斯',
    herro: '希罗', hield: '希尔德', hinson: '欣森', holiday: '霍勒迪', holland: '霍兰德', holmes: '霍姆斯',
    holmgren: '霍姆格伦', horford: '霍福德', howard: '霍华德', huerter: '赫尔特尔', huff: '哈夫', hunter: '亨特',
    hyland: '海兰德', ingram: '英格拉姆', irving: '欧文', isaac: '艾萨克', jackson: '杰克逊', james: '詹姆斯',
    jaquez: '哈克斯', jefferson: '杰斐逊', jerome: '杰罗姆', joe: '乔', johnson: '约翰逊', jokic: '约基奇',
    jones: '琼斯', jordan: '乔丹', jovic: '约维奇', kalkbrenner: '卡尔克布伦纳', kennard: '肯纳德',
    kessler: '凯斯勒', kispert: '基斯珀特', knecht: '克内希特', knueppel: '克努佩尔', kolek: '科莱克',
    kornet: '科内特', kuminga: '库明加', kuzma: '库兹马', landale: '兰代尔', lavine: '拉文', leonard: '伦纳德',
    lillard: '利拉德', lively: '莱夫利', looney: '卢尼', lopez: '洛佩斯', love: '乐福', lyles: '莱尔斯',
    maluach: '马卢阿赫', mann: '曼恩', markkanen: '马尔卡宁', marshall: '马歇尔', martin: '马丁',
    mathurin: '马图林', maxey: '马克西', mcbride: '麦克布莱德', mccain: '麦凯恩', mccollum: '麦科勒姆',
    mcconnell: '麦康奈尔', mcdaniels: '麦克丹尼尔斯', mclaughlin: '麦克劳克林', melton: '梅尔顿',
    merrill: '梅里尔', middleton: '米德尔顿', miller: '米勒', mitchell: '米切尔', mobley: '莫布利',
    monk: '蒙克', moody: '穆迪', morant: '莫兰特', murphy: '墨菲', murray: '穆雷', nance: '南斯',
    nelson: '纳尔逊', nembhard: '内姆哈德', nesmith: '内史密斯', niang: '尼昂', nnaji: '纳吉', nurkic: '努尔基奇',
    okogie: '奥科吉', okongwu: '奥孔古', okoro: '奥科罗', oubre: '乌布雷', payton: '佩顿', peterson: '彼得森',
    phillips: '菲利普斯', pippen: '皮蓬', podziemski: '波杰姆斯基', poeltl: '珀尔特尔', poole: '普尔',
    porter: '波特', portis: '波蒂斯', porzingis: '波尔津吉斯', powell: '鲍威尔', pritchard: '普里查德',
    prosper: '普罗斯珀', queta: '克塔', quickley: '奎克利', randle: '兰德尔', reaves: '里夫斯', reid: '里德',
    richards: '理查兹', richardson: '理查森', robinson: '罗宾逊', rollins: '罗林斯', russell: '拉塞尔',
    sabonis: '萨博尼斯', sarr: '萨尔', schroder: '施罗德', scott: '斯科特', sexton: '塞克斯顿',
    sharpe: '夏普', sharp: '夏普', sheppard: '谢泼德', siakam: '西亚卡姆', simons: '西蒙斯', simpson: '辛普森',
    smith: '史密斯', spencer: '斯宾塞', suggs: '萨格斯', sengun: '申京', tatum: '塔图姆', thompson: '汤普森',
    thompson: '汤普森', towns: '唐斯', turner: '特纳', vassell: '瓦塞尔', vucevic: '武切维奇',
    wade: '韦德', walker: '沃克', ware: '韦尔', washington: '华盛顿', watson: '沃森', wembanyama: '文班亚马',
    westbrook: '威斯布鲁克', white: '怀特', wiggins: '威金斯', williams: '威廉姆斯', williamson: '威廉姆森',
    winston: '温斯顿', wood: '伍德', young: '杨', zubac: '祖巴茨', yabusele: '亚布塞莱', aldama: '阿尔达马',
    // extra surnames used by generated draft classes
    moreau: '莫罗', kovac: '科瓦奇', petrovic: '彼得罗维奇', vasquez: '巴斯克斯', sok: '索克',
    okafor: '奥卡福', okoye: '奥科耶', osei: '奥塞', mbaye: '姆巴耶', mensah: '门萨', silva: '席尔瓦',
    freeman: '弗里曼', dixon: '迪克森', prince: '普林斯', holloway: '霍洛威', langford: '兰福德',
    sutton: '萨顿', reyes: '雷耶斯', novak: '诺瓦克', barlow: '巴洛', griffin: '格里芬',
    bennett: '贝内特', rivers: '里弗斯', sanders: '桑德斯', tanaka: '田中', ndiaye: '恩迪亚耶',
    kwame: '夸梅', tariq: '塔里克', rashad: '拉沙德', bryce: '布莱斯', jaden: '贾登', terrance: '特伦斯',
    omar: '奥马尔', mateo: '马特奥', dimitri: '迪米特里', cole: '科尔', xavier: '泽维尔', kwame: '夸梅',
    walsh: '沃尔什', wallace: '华莱士', veesaar: '维萨', niederhauser: '尼德豪泽', konan: '科南', mcgowens: '麦高文斯', nzosa: '恩佐萨', wolf: '沃尔夫', whitmore: '惠特莫尔', santos: '桑托斯', sarr: '萨尔', scheierman: '谢尔曼', cenac: '塞纳克', garza: '加尔萨', harper: '哈珀', queta: '克塔',
    hauser: '豪泽', pritchard: '普里查德', kornet: '科内特', simons: '西蒙斯', vit: '维特', kalkbrenner: '卡尔克布伦纳',
    minott: '米诺特', omier: '奥米尔', tomlin: '汤姆林', richards: '理查兹', barlow: '巴洛', bouyea: '布耶亚',
    beekman: '比克曼', kj: 'KJ', simpson: '辛普森', matkovic: '马特科维奇', penda: '彭达', reath: '里斯',
  };

  // consonant + vowel -> char
  const CV = {
    ba: '巴', be: '贝', bi: '比', bo: '博', bu: '布', by: '比',
    ca: '卡', ce: '塞', ci: '西', co: '科', cu: '库', cy: '西',
    cha: '查', che: '切', chi: '奇', cho: '乔', chu: '楚',
    da: '达', de: '德', di: '迪', do: '多', du: '杜', dy: '迪',
    fa: '法', fe: '费', fi: '菲', fo: '福', fu: '富', fy: '菲',
    ga: '加', ge: '格', gi: '吉', go: '戈', gu: '古', gy: '吉',
    ha: '哈', he: '赫', hi: '希', ho: '霍', hu: '胡', hy: '希',
    ja: '贾', je: '杰', ji: '吉', jo: '乔', ju: '朱', jy: '杰',
    ka: '卡', ke: '凯', ki: '基', ko: '科', ku: '库', ky: '基',
    la: '拉', le: '勒', li: '利', lo: '洛', lu: '卢', ly: '利',
    ma: '马', me: '梅', mi: '米', mo: '莫', mu: '穆', my: '米',
    na: '纳', ne: '内', ni: '尼', no: '诺', nu: '努', ny: '尼',
    pa: '帕', pe: '佩', pi: '皮', po: '波', pu: '普', py: '皮',
    qua: '夸', que: '克', qui: '奎',
    ra: '拉', re: '雷', ri: '里', ro: '罗', ru: '鲁', ry: '里',
    sa: '萨', se: '塞', si: '西', so: '索', su: '苏', sy: '西',
    sha: '沙', she: '谢', shi: '希', sho: '肖', shu: '舒',
    ta: '塔', te: '特', ti: '蒂', to: '托', tu: '图', ty: '蒂',
    tha: '萨', the: '塞', thi: '西', tho: '索', thu: '苏',
    va: '瓦', ve: '维', vi: '维', vo: '沃', vu: '武', vy: '维',
    wa: '瓦', we: '韦', wi: '威', wo: '沃', wu: '伍', wy: '威',
    ya: '亚', ye: '耶', yi: '伊', yo: '约', yu: '尤', yy: '伊',
    za: '扎', ze: '泽', zi: '齐', zo: '佐', zu: '祖', zy: '齐',
  };
  const CODA = {
    n: '恩', m: '姆', r: '尔', s: '斯', t: '特', l: '尔', d: '德', k: '克', c: '克',
    ng: '恩', nd: '恩德', nt: '恩特', st: '斯特', rd: '德', rt: '特', ld: '尔德',
    rn: '恩', rk: '克', ll: '尔', ss: '斯', ck: '克', sh: '什', ch: '奇', th: '思',
    g: '格', p: '普', b: '布', f: '夫', v: '夫', x: '克斯', z: '兹', ts: '茨',
  };
  const VOWEL = { a: '阿', e: '埃', i: '伊', o: '奥', u: '乌', y: '伊' };

  function translit(word) {
    const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return '';
    let out = '';
    let i = 0;
    while (i < w.length) {
      // consonant cluster + vowel
      let matched = false;
      for (let len = 4; len >= 2; len--) {
        const chunk = w.slice(i, i + len);
        if (CV[chunk]) { out += CV[chunk]; i += len; matched = true; break; }
      }
      if (matched) continue;
      const c = w[i];
      if (VOWEL[c]) { out += VOWEL[c]; i += 1; continue; }
      // consonant + coda
      let coda = '';
      for (let len = 3; len >= 1; len--) {
        const chunk = w.slice(i, i + len);
        if (CODA[chunk]) { coda = CODA[chunk]; i += len; break; }
      }
      if (coda) { out += coda; continue; }
      i += 1;
    }
    return out;
  }

  function parts(fullName) {
    const raw = String(fullName || '').replace(/\s+/g, ' ').trim();
    const suffix = /(Jr\.|Sr\.|III|IV|II)$/.exec(raw);
    let base = raw.replace(/\s*(Jr\.|Sr\.|III|IV|II)$/, '').trim();
    const seg = base.split(' ');
    const first = seg[0] || '';
    const last = seg.slice(1).join(' ') || '';
    return { first, last, suffix: suffix ? suffix[1] : '' };
  }

  function name(fullName) {
    if (!fullName) return '';
    if (FULL[fullName]) return FULL[fullName];
    const { first, last, suffix } = parts(fullName);
    const fz = FIRST[first.toLowerCase()] || translit(first);
    const lzParts = last.split(/[-\s]+/).filter(Boolean).map((p) => LAST[p.toLowerCase()] || translit(p));
    const lz = lzParts.join('-');
    if (!lz) return fz;
    if (suffix === 'Jr.') return `小${fz}·${lz}`;
    if (suffix === 'II') return `${fz}·${lz}二世`;
    if (suffix === 'III') return `${fz}·${lz}三世`;
    return `${fz}·${lz}`;
  }

  const DIV = { Atlantic: '大西洋区', Central: '中部区', Southeast: '东南区', Pacific: '太平洋区', Southwest: '西南区', Northwest: '西北区' };
  function division(name) { return DIV[name] || name; }

  function team(abbr) {
    const t = TEAM[abbr];
    return t ? t[0] : abbr;
  }
  function teamShort(abbr) {
    const t = TEAM[abbr];
    return t ? t[1] : abbr;
  }

  root.ZH = { name, team, teamShort, division, translit, TEAM };
})(typeof window !== 'undefined' ? window : globalThis);

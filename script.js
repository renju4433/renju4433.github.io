// 从 txt 文件中提取的数据（直接嵌入）
const rawData = `
1	010005	Nakamura Shigeru (中村茂)	日本	东京	2951
2	020303	Sushkov Vladimir (苏什科夫·弗拉基米尔)	俄罗斯	加特契纳	2898
3	100394	Jiang Qiwen (江齐文)	中国	广东	2839
4	010302	Kamiya Shunsuke (神谷俊介)	日本	东京	2836
5	090005	Soosõrv Ants (索索夫·安茨)	爱沙尼亚	塔林	2818
6	100961	Ni Zhongxing (倪仲星)	中国	河北	2804
7	200001	Wai Chan Keong (韦振强)	中国澳门	　	2797
8	100274	Huang Liqin (黄立勤)	中国	广东	2780
9	110036	Lin Shu-Hsuan (林书玄)	中国台湾	嘉义	2775
10	100069	Cao Dong (曹冬)	中国	北京	2773
11	100354	Qi Guan (祁观)	中国	黑龙江	2772
12	100974	Ling Shijie (凌世杰)	中国	浙江	2771
13	010251	Nakayama Tomoharu (中山智晴)	日本	Gumma	2760
14	100144	Huang Shengming (黄圣明)	中国	四川	2752
15	100073	Ai Xianping (艾显平)	中国	湖北	2726
16	100052	Zhang Yifeng (张轶峰)	中国	上海	2720
17	020913	Orlov Maxim (奥尔洛夫·马克西姆)	俄罗斯	下诺夫哥罗德	2710
18	010097	Okabe Hiroshi (冈部宽)	日本	东京	2709
19	101007	He Shujun (何舒军)	中国	湖南	2705
20	090041	Oll Aivo (欧尔·爱伏)	爱沙尼亚	塔林	2700
21	100041	Zhu Jianfeng (朱建锋)	中国	上海	2689
22	100230	Lu Hai (芦海)	中国	广西	2686
23	100074	Mei Fan (梅凡)	中国	湖北	2679
24	100442	Wang Qingqing (汪清清)	中国	湖北	2677
25	100067	Wu Di (吴镝)	中国	辽宁	2675
26	101292	Fu Xuanqi (符轩齐)	中国	上海	2670
27	020847	Danilin Ivan (丹尼林·伊万)	俄罗斯	莫斯科	2667
28	100353	Chen Jing (陈靖)	中国	江苏	2657
29	090147	Topkin Georg-Romet (托普金·格奥尔格-罗梅特)	爱沙尼亚	塔林	2656
30	010281	Nagasoe Hiroki (长副纮树)	日本	福冈	2651
31	990041	Huang Jin-xian (黄金贤)	中国香港	　	2647
32	110015	Chen Ko-Han (陈科翰)	中国台湾	台北	2644
33	021068	Pinsky Alexander (平斯基·亚历山大)	俄罗斯	波久加	2644
34	010399	Makino Mitsunori (牧野光则)	日本	京都	2642
35	020004	Nikonov Konstantin (尼科诺夫·康斯坦丁)	俄罗斯	莫斯科	2640
36	130059	Hwang Do-hoon (黄度勋)	韩国	大邱	2640
37	100173	Chen Xin (陈新)	中国	四川	2638
38	100977	Jiao Zhengrui (焦政瑞)	中国	山东	2638
39	100208	Xu Jiaqi (徐嘉琦)	中国	河北	2634
40	110025	Lin Huang-Yu (林皇羽)	中国台湾	台北	2634
41	990037	Eged Igor (埃格特·伊戈尔)	斯洛伐克	布拉迪斯拉发	2633
42	170026	László Zoltán (拉斯洛·佐尔坦)	匈牙利	布达佩斯	2631
43	100355	Xie Weixiang (谢维祥)	中国	江苏	2625
44	010320	Tachi Masaya (馆雅也)	日本	石川	2624
45	110053	Chien Yung-Hsuan (简咏璇)	中国台湾	台北	2619
46	020424	Epifanov Dmitry (叶皮法诺夫·德米特里)	俄罗斯	莫斯科	2612
47	030048	Gardström Petter (加迪斯特勒姆·彼得)	瑞典	厄比胡斯	2610
48	090113	Mesila Villem (梅西拉·维莱姆)	爱沙尼亚	塔林	2607
49	100747	Li Xiaoqing (李小青)	中国	江苏	2605
50	020885	Gromov Danila (格罗莫夫·丹尼拉)	俄罗斯	伊热夫斯克	2604
51	100027	Ge Lingfeng (葛凌峰)	中国	上海	2600
52	100703	Gao Cong (高聪)	中国	北京	2598
53	100279	Xi Zhenyang (奚振扬)	中国	江苏	2597
54	020093	Salnikov Pavel (萨尔尼科夫·帕维尔)	俄罗斯	圣彼得堡	2597
55	100263	Zheng Weinan (郑蔚楠)	中国	上海	2596
56	100513	Qian Kun (钱坤)	中国	上海	2594
57	020251	Makarov Pavel (马卡罗夫·帕维尔)	俄罗斯	莫斯科	2590
58	101242	Zhang Xiaojian (章小剑)	中国	陕西	2587
59	130071	Kang Sang-min (姜相旻)	韩国	首尔	2585
60	101423	Zhou Nan (周楠)	中国	江苏	2585
61	100824	Meng Jiehuan (蒙杰焕)	中国	广西	2582
62	100608	Wan Junhong (万俊宏)	中国	四川	2582
63	100267	Zhu Kai (朱凯)	中国	广东	2581
64	090143	Lõhmus Kristofer (洛赫穆斯·克里斯托弗)	爱沙尼亚	塔林	2581
65	010161	Koyama Jun (小山纯)	日本	东京	2580
66	090074	Hõbemägi Martin (赫贝梅吉·马丁)	爱沙尼亚	塔林	2579
67	020244	Fedorkin Oleg (费多尔金·奥列格)	俄罗斯	莫斯科	2578
68	160159	Żukowski Michał (茹科夫斯基·米哈乌)	波兰	日米格鲁德	2577
69	100231	Lan Zhiren (兰志仁)	中国	四川	2577
70	100954	Yang Tingyu (杨听雨)	中国	北京	2572
71	020693	Kachaev Denis (卡恰耶夫·丹尼斯)	俄罗斯	圣彼得堡	2571
72	020848	Lavrik-Karmazin Maksim (拉夫里克-卡尔马钦·马克西姆)	俄罗斯	莫斯科	2570
73	010248	Tamada Yoichi (玉田阳一)	日本	水户	2568
74	030115	Lind Björn (林德·比约恩)	瑞典	斯德哥尔摩	2567
75	020682	Fedotov Denis (费多托夫·丹尼斯)	俄罗斯	波久加	2565
76	090017	Lents Johann (伦茨·约翰)	爱沙尼亚	塔林	2564
77	100186	Huang Yufeng (黄宇峰)	中国	上海	2561
78	100276	He Qifa (贺启发)	中国	广东	2560
79	010021	Hasegawa Kazuto (长谷川一人)	日本	大阪	2554
80	100710	Liu Yang (刘洋)	中国	山东	2554
81	020368	Artemyev Sergey (阿尔捷梅夫·谢尔盖)	俄罗斯	圣彼得堡	2552
82	020301	Karasyov Maxim (卡拉肖夫·马克西姆)	俄罗斯	下诺夫哥罗德	2547
83	010020	Kawamura Norihiko (河村典彦)	日本	东京	2546
84	100949	Mao Weiming (毛玮铭)	中国	浙江	2544
85	100736	Liu Qin (刘沁)	中国	四川	2544
86	110003	Chang Yi-Feng (张益丰)	中国台湾	台北	2543
87	020837	Yusupmurzina Darya (尤苏普穆尔津纳·达里娅)	俄罗斯	波久加	2542
88	020497	Kryuchok Roman (可留乔克·罗曼)	俄罗斯	波久加	2542
89	101953	Cai Ziyang (蔡子扬)	中国	江苏	2542
90	100397	Jin Hongli (金洪利)	中国	辽宁	2541
91	090066	Pajuste Renee (帕尤斯特·雷内)	爱沙尼亚	哈普萨卢	2538
92	020382	Savrasova Yulia (萨夫拉索娃·尤利娅)	俄罗斯	波久加	2536
93	100601	Zhu Tianyi (朱天逸)	中国	北京	2536
94	020390	Smirnov Evgeny (斯米尔诺夫·叶夫根尼)	俄罗斯	雷宾斯克	2535
95	110086	Chou Huang Yu-Chien (周黄有建)	中国台湾	高雄	2531
96	101100	Tang Shiqi (唐世祺)	中国	江苏	2527
97	100357	Yin Tong (殷桐)	中国	北京	2525
98	020907	Burtsev Peter (布尔采夫·彼得)	俄罗斯	莫斯科	2525
99	100143	Fan Xingcen (樊星岑)	中国	上海	2523
100	010265	Kawano Takahisa (河野高久)	日本	下关	2521
101	020786	Rizvanov Edward (里兹瓦诺夫·爱德华)	俄罗斯	新罗西斯克	2521
102	101872	Zhang Yuhao (张玉灏)	中国	上海	2520
103	100290	Li Dong (李东)	中国	四川	2519
104	101963	Yu Junyi (于俊艺)	中国	北京	2518
105	130183	Cha Seung-hyun	韩国	京畿道	2516
106	100517	He Qiqiang (何其强)	中国	广东	2515
107	100446	Huang Qiongying (黄琼莹)	中国	湖北	2515
108	100859	Huang Yimiao (黄益苗)	中国	浙江	2514
109	100175	Huo Jiuxu (霍九旭)	中国	河南	2514
110	150188	Souček Lukáš (苏切克·卢卡斯)	捷克	　	2512
111	100865	Shen Lanxin (沈兰心)	中国	四川	2512
112	101101	Fan Jiahao (范家豪)	中国	湖南	2508
113	090025	Ilu Timo (伊鲁·蒂姆)	爱沙尼亚	塔林	2508
114	010349	Inoue Fumiya (井上史也)	日本	埼玉	2508
115	130213	Song Min-hyeok	韩国	全罗南道	2507
116	100654	Xu Jianxin (徐建鑫)	中国	北京	2507
117	020370	Balabhai Viktor (巴拉贝·维克多)	俄罗斯	圣彼得堡	2507
118	100877	Dong Xinwu (董新武)	中国	湖北	2506
119	040061	Bulatovsky Oleg (布拉托夫斯基·奥列格)	乌克兰	利沃夫	2506
120	100448	Huang Jianguang (黄健光)	中国	广西	2505
121	020318	Rusin Vladislav (鲁辛·弗拉季斯拉夫)	俄罗斯	下诺夫哥罗德	2505
122	100684	Liu Jie (刘杰)	中国	天津	2504
123	100732	Kang Tingrui (康庭瑞)	中国	浙江	2503
124	101099	Yan Yali (严雅丽)	中国	江苏	2503
125	020130	Kozhin Mikhail (科真·米哈伊尔)	俄罗斯	杜布纳	2501
126	100005	Yin Licheng (殷立成)	中国	北京	2500
127	110141	Cheng Mu-Jung (郑睦融)	中国台湾	台北	2499
128	100020	Gu Wei (顾炜)	中国	上海	2499
129	101480	Jin Rui (金瑞)	中国	浙江	2498
130	101009	Huang Xiangning (黄湘凝)	中国	湖北	2497
131	100734	Tao Junji (陶俊吉)	中国	浙江	2497
132	120013	Saarenpää Samuli (萨伦佩·萨穆利)	芬兰	坦佩雷	2495
133	020080	Filinov Vladimir (菲利诺夫·弗拉基米尔)	俄罗斯	圣彼得堡	2494
134	100726	Xu Yikuan (徐毅宽)	中国	浙江	2494
135	101314	Ding Zeyu (丁泽宇)	中国	江苏	2493
136	100785	Liang Zhong (梁中)	中国	湖南	2490
137	110018	Yu Tien-Lung (游天龙)	中国台湾	桃园	2490
138	100978	Liu Shaoqi (刘邵琪)	中国	江苏	2488
139	020216	Mikhailov Alexey (米哈伊洛夫·阿列克谢)	俄罗斯	科捷利尼科沃	2488
140	100519	Wu Zhiqin (吴志琴)	中国	江苏	2483
141	100431	Liu Chao (刘超)	中国	四川	2482
142	021056	Burtsev Nikolai (布尔采夫·尼古拉)	俄罗斯	莫斯科	2481
143	010338	Fujita Yudai (藤田雄大)	日本	滨松	2480
144	100272	Tan Xinlin (谭鑫麟)	中国	湖南	2474
145	100475	Wang Qichao (王启超)	中国	黑龙江	2468
146	150051	Laube Pavel (劳贝·帕维尔)	捷克	布拉格	2467
147	130191	Lee Ho June (李镐准)	韩国	首尔	2466
148	020042	Skuridin Alexey (斯库里金·阿列克谢)	俄罗斯	下诺夫哥罗德	2465
149	100518	Hong Shiguang (洪士光)	中国	江西	2465
150	130068	Park Woong-bae	韩国	大邱	2464
151	101768	Yang Zixuan (杨子煊)	中国	浙江	2458
152	101313	Xiao Luka (肖卢卡)	中国	浙江	2458
153	100434	Liu Xun (刘恂)	中国	湖北	2457
154	130207	Heo Jeong-bin	韩国	釜山	2457
155	100963	Zhong Yuyang (钟煜阳)	中国	四川	2453
156	010419	Matsuda Shoma (松田将马)	日本	东京	2451
157	110055	Huang Yen-Hua (黄彦桦)	中国台湾	台北	2449
158	020354	Sorokina Oksana (索罗金娜·奥克萨纳)	俄罗斯	波久加	2449
159	020238	Barykin Victor (巴雷金·维克多)	俄罗斯	伏尔加格勒	2448
160	101507	Zhou Chenli (周陈立)	中国	浙江	2447
161	100784	Tian Haoyang (田昊洋)	中国	山东	2446
162	130077	Choi Dong-wook	韩国	京畿道	2445
163	100888	Zhu Jiayi (朱佳颐)	中国	上海	2444
164	100635	Cheng Yanzhen (成艳珍)	中国	广西	2443
165	090049	Purk Tauri (帕克·陶里)	爱沙尼亚	塔林	2439
166	101769	Chen Haoyuan (陈浩源)	中国	山东	2438
167	010436	Yokoyama Shota (横山翔汰)	日本	东京	2437
168	100889	Li Jiajun (李嘉骏)	中国	山东	2434
169	101317	Shen Yihang (沈诣航)	中国	浙江	2434
170	130190	Kim Yun Tae	韩国	大邱	2433
171	110022	Lu Wei-Yuan (卢炜元)	中国台湾	台北	2431
172	101817	Wang Bowen (王博文)	中国	甘肃	2430
173	101529	Cheng Zihang (程梓航)	中国	湖北	2430
174	100395	Yu Yajun (于亚君)	中国	辽宁	2429
175	100861	Chen Jie (陈杰)	中国	湖南	2428
176	101711	Zhang Ruiyang (张瑞扬)	中国	广东	2427
177	030031	Karlsson Stefan (卡尔森·史蒂芬)	瑞典	斯德哥尔摩	2427
178	130012	Kim Gyu-Hyeon (金奎炫)	韩国	仁川	2426
179	030058	Lindberg Kristian (林德伯格·克里斯蒂安)	瑞典	瓦尔贝里	2424
180	090118	Rahumägi Brenet (拉胡马吉·布勒内)	爱沙尼亚	塔林	2424
181	100322	Wang Yelin (王烨林)	中国	江苏	2424
182	100887	Hu Long (胡龙)	中国	云南	2421
183	101509	Dong Jiahao (董家豪)	中国	广东	2420
184	020797	Porokhina Ekaterina (波罗欣娜·叶卡捷琳娜)	俄罗斯	波久加	2419
185	010384	Fujita Maiko (藤田麻衣子)	日本	东京	2419
186	020394	Berezin Roman (别列津·罗曼)	俄罗斯	圣彼得堡	2419
187	110129	Liao Li-Chia (廖豊嘉)	中国台湾	桃园	2418
188	130095	Kim Kyeong-bae	韩国	首尔	2416
189	030127	Jellve Emma (耶尔韦·艾玛)	瑞典	北雪平	2413
190	020261	Metreveli Irina (梅特列韦利·伊琳娜)	俄罗斯	波久加	2411
191	101133	Li Bolai (李伯来)	中国	浙江	2410
192	010046	Ishitani Shin-ichi (石谷信一)	日本	富士	2410
193	101327	Wang Yilin (王弈霖)	中国	江苏	2408
194	110026	Yang Yu-Hsiung (杨裕雄)	中国台湾	台中	2407
195	010322	Tanaka Toshiki (田中寿树)	日本	福冈	2406
196	020813	Metreveli Maksim (梅特列韦利·马克西姆)	俄罗斯	阿尔汉格尔斯克	2406
197	100980	Liu Mengyun (刘梦云)	中国	浙江	2405
198	100893	He Yucheng (贺禹成)	中国	北京	2405
199	010044	Matsuura Hiroshi (松浦浩)	日本	广岛	2405
200	020804	Katsev Ilya (卡采夫·伊利亚)	俄罗斯	圣彼得堡	2401
201	101359	Wu You (吴悠)	中国	河北	2400
202	010106	Iio Yoshihiro (饭尾义弘)	日本	神户	2396
203	020010	Sirategyan Karen (西拉捷吉扬·卡连)	俄罗斯	莫斯科	2395
204	100132	Shi Xiaolin (师晓林)	中国	北京	2395
205	100751	Ma Hongzhou (马宏洲)	中国	陕西	2395
206	100945	Zhang Junyu (张俊宇)	中国	上海	2394
207	130118	Ryu Han-ju	韩国	京畿道	2391
208	010289	Fukui Nobuhiro (福井畅宏)	日本	丰川	2389
209	102247	Pan Guanchen (潘冠臣)	中国	山东	2389
210	101403	Qiao Mingtian (乔明天)	中国	天津	2388
211	020908	Tolstoguzova Daria (托尔斯托古佐娃·达里娅)	俄罗斯	下诺夫哥罗德	2388
212	100356	Wang Youzhi (王有志)	中国	安徽	2387
213	010120	Ono Takayuki (小野孝之)	日本	横滨	2386
214	100432	Xie Zengzhong (谢增忠)	中国	福建	2385
215	101424	Shen Tianzuo (沈天佐)	中国	浙江	2385
216	020110	Dvoeglazov Vladimir (德沃耶格拉佐夫·弗拉基米尔)	俄罗斯	秋明	2385
217	101671	Jin Hongtao (金弘韬)	中国	浙江	2385
218	101873	Deng Yuanxi (邓园羲)	中国	上海	2384
219	130003	Choi Yun Suk	韩国	京畿道	2384
220	100600	Yao Yujie (姚宇杰)	中国	上海	2384
221	101518	Peng Chengjin (彭程锦)	中国	四川	2383
222	101125	Huang Daxing (黄大兴)	中国	海南	2382
223	101131	Zhang Xinyi (张欣怡)	中国	上海	2382
224	100243	Wei Qiang (魏强)	中国	天津	2381
225	100944	Wang Kemiao (王珂苗)	中国	上海	2380
226	101516	Zhu Hongming (朱泓铭)	中国	上海	2379
227	100671	Liao Zhenhuan (廖镇焕)	中国	广东	2378
228	101865	Xia Jianjin (夏建晋)	中国	江西	2374
229	101515	Zheng Zhen (郑桢)	中国	上海	2373
230	010087	Kuga Akio (久家彰夫)	日本	佐世保	2373
231	190018	Kirkan Alp Ali (柯尔坎·阿尔普·阿里)	土耳其	伊斯坦布尔	2369
232	100281	Chen Tao (陈涛)	中国	河南	2369
233	101315	Zhu Yancheng (朱彦丞)	中国	浙江	2366
234	020975	Startsev Maksim (斯塔尔采夫·马克西姆)	俄罗斯	科诺沙	2366
235	101293	Hu Jinrui (胡晋瑞)	中国	浙江	2366
236	101018	Wang Miao (王淼)	中国	北京	2366
237	100827	Ma Chenzhi (马晨致)	中国	北京	2364
238	100955	Xu Zhihan (许志含)	中国	北京	2360
239	130113	Jang Won-cheol (张源哲)	韩国	忠清北道	2357
240	020008	Mikhailov Alexander (米哈伊洛夫·亚历山大)	俄罗斯	莫斯科	2356
241	030007	Jonsson Peter (琼森·彼得)	瑞典	胡斯克瓦纳	2356
242	100547	Zheng Yining (郑逸宁)	中国	浙江	2356
243	020381	Mikryukov Mikhail (米克留科夫·米哈伊尔)	俄罗斯	波久加	2355
244	130206	Jang Eun Min (张恩民)	韩国	首尔	2353
245	100979	Li Zhen (李榛)	中国	浙江	2353
246	101322	Lu Yi (鲁益)	中国	浙江	2353
247	110092	Liao Jun-Yen (廖仲彦)	中国台湾	新竹	2352
248	101393	Fan Weichen (范玮宸)	中国	北京	2352
249	101318	Zhang Zhiyuan (张致远)	中国	浙江	2351
250	021019	Mikryukov Sergey (米克留科夫·谢尔盖)	俄罗斯	波久加	2348
251	100206	Wang Shuo (王硕)	中国	北京	2348
252	101319	Ruan Jintong (阮瑾潼)	中国	浙江	2345
253	080001	Poghosyan Albert (波格霍相·阿尔伯特)	亚美尼亚	埃里温	2341
254	101874	Zhou Wubin (周吴彬)	中国	江苏	2341
255	010434	Oomura Shu (大村周)	日本	名古屋	2339
256	190022	Kaan Aslan İbrahim (卡恩·阿斯兰·易卜拉欣)	土耳其	伊斯坦布尔	2338
257	021053	Petrova Mariia (彼得罗娃·玛丽亚)	俄罗斯	波久加	2337
258	010420	Tanaka Shotaro (田中祥太郎)	日本	京都	2336
259	020259	Radzevelyuk Alexander (拉泽韦柳克·亚历山大)	俄罗斯	雷宾斯克	2334
260	030089	Eriksson Bjorn (埃里克森·比约恩)	瑞典	斯德哥尔摩	2334
261	020694	Lisyutin Alexander (利休京·亚历山大)	俄罗斯	圣彼得堡	2333
262	100478	Shi Ling (石玲)	中国	重庆	2332
263	200008	Yuan Wa Chon (袁华俊)	中国澳门	　	2330
264	101321	Fan Feifan (樊非凡)	中国	浙江	2330
265	020882	Tolstoguzova Sofia (托尔斯图古佐娃·索菲娅)	俄罗斯	下诺夫哥罗德	2327
266	101527	Deng Qi (邓祺)	中国	山东	2327
267	110087	Ke Fang-Ying (柯芳颖)	中国台湾	台中	2327
268	101119	Zha Quanning (查全宁)	中国	江苏	2326
269	100293	Huang Ming (黄明)	中国	天津	2326
270	020903	Kuvaev Vyacheslav (库瓦耶夫·维亚切斯拉夫)	俄罗斯	科诺沙	2325
271	100151	Fu Liang (傅亮)	中国	江苏	2325
272	101135	Chen Zihan (陈梓涵)	中国	浙江	2323
273	160010	Małowiejski Piotr (马洛维斯基·彼得)	波兰	普沃茨克	2320
274	101520	Zhou Sizhe (周思哲)	中国	江苏	2318
275	100725	Fan Xuanzuo (范宣佐)	中国	上海	2318
276	101517	Yang Xinlin (杨昕霖)	中国	江苏	2316
277	020928	Fokicheva Anna (福基切娃·安娜)	俄罗斯	波久加	2314
278	101523	Li Jinshang (李锦尚)	中国	山东	2313
279	020959	Sidorov Mikhail (西多罗夫·米哈伊尔)	俄罗斯	科诺沙	2313
280	101514	Liu Chuanxing (刘传星)	中国	安徽	2312
281	100515	Yang Bin (杨彬)	中国	江苏	2312
282	090157	Kõlar Karl-Ustav (科拉尔·卡尔-乌斯塔夫)	爱沙尼亚	塔林	2311
283	101521	Zhang Huaijin (张怀瑾)	中国	山东	2311
284	100687	Dong Chenying (董晨瑛)	中国	上海	2310
285	101316	Wang Yuxi (王毓熙)	中国	浙江	2310
286	100012	Chen Wei (陈伟)	中国	北京	2310
287	100015	Hu Xi (胡夕)	中国	北京	2309
288	130096	Han Tae-ho (韩太淏)	韩国	仁川	2308
289	101058	Lin Yizhong (林奕忠)	中国	广东	2307
290	100388	Yang Yimeng (杨镒萌)	中国	河北	2305
291	100545	Zhang Jiguo (张纪国)	中国	浙江	2305
292	100950	Wang Jiayi (王嘉一)	中国	浙江	2303
293	100757	Zhu Xiaojuan (朱小娟)	中国	云南	2302
294	021008	Troitsky Vsevolod (特罗伊茨基·弗谢沃洛德)	俄罗斯	下诺夫哥罗德	2302
295	100826	Huang Junming (黄俊铭)	中国	北京	2301
296	101531	Feng Lyuchi (冯律驰)	中国	江苏	2301
297	101120	Wang Jing (王竞)	中国	安徽	2301
298	100072	Lan Yang (兰洋)	中国	江苏	2300
299	020954	Morozov Egor (莫罗佐夫·叶戈尔)	俄罗斯	莫斯科	2300
300	100364	Chen Zhu (陈柱)	中国	安徽	2300
301	101323	Yu Changxuan (喻常轩)	中国	浙江	2299
302	101512	Luo Wenmiao (罗文妙)	中国	山东	2297
303	100477	Yu Qunqiu (余群秋)	中国	浙江	2297
304	090156	Raag Ardi (拉格·阿尔季)	爱沙尼亚	塔林	2297
305	021118	Zhukov Lev (朱可夫·列夫)	俄罗斯	莫斯科	2296
306	130181	Kim Ki Tae	韩国	京畿道	2295
307	100730	Qiu Yujin (邱彧瑾)	中国	浙江	2295
308	090116	Kolk Kuno (科尔克·昆诺)	爱沙尼亚	塔林	2295
309	020305	Sumarokova Aleksandra (苏马罗科娃·亚历山德拉)	俄罗斯	波久加	2293
310	021072	Tonchilo Konstantin (通奇洛·康斯坦丁)	俄罗斯	符拉迪沃斯托克	2293
311	102121	Guo Renheng (郭韧恒)	中国	四川	2293
312	050042	Semjonov Dmitrij (谢苗诺夫·德米特里)	拉脱维亚	里加	2290
313	030114	Sandstrom Richard (桑德斯特勒姆·理查德)	瑞典	延雪平	2290
314	010348	Miyamoto Syunju (宫本俊寿)	日本	宫城	2290
315	020597	Lashko Kira (拉什科·基拉)	俄罗斯	波久加	2289
316	020775	Matushkina Ksenia (马图什金娜·克谢尼娅)	俄罗斯	波久加	2289
317	101791	Cheng Huabin (程华滨)	中国	广东	2289
318	101971	Sun Siliang (孙斯亮)	中国	北京	2287
319	101467	Zhao Youjia (赵有嘉)	中国	浙江	2287
320	101296	Liao Yuntong (廖蕴彤)	中国	上海	2287
321	101530	Fei Ming (费铭)	中国	浙江	2287
322	100866	Huang Luotong (黄洛桐)	中国	广东	2287
323	101535	Pan Shaoqin (潘绍钦)	中国	浙江	2286
324	100783	Cen Huoyu (岑活愉)	中国	湖南	2285
325	010414	Kawamoto Shoma (河本翔马)	日本	山口	2283
326	101425	Chen Zengziran (陈曾子然)	中国	浙江	2283
327	200009	Lo Chan Hin (罗振轩)	中国澳门	　	2283
328	010291	Mano Yoshihisa (真野芳久)	日本	丰田	2282
329	101712	Song Chanjuan (宋婵娟)	中国	河南	2281
330	080029	Nersisyan Rafik	亚美尼亚	埃里温	2280
331	090135	Ikla Markus (伊克拉·马库斯)	爱沙尼亚	塔林	2280
332	010425	Yoshimoto Yuta (吉本悠太)	日本	东京	2280
333	010176	Iwano Fumio (岩野文雄)	日本	埼玉	2280
334	100627	Liu Huajun (刘华军)	中国	北京	2280
335	010126	Takashima Junya (高岛纯也)	日本	大阪	2279
336	101713	Zheng Xiaoyang (郑笑阳)	中国	陕西	2278
337	101481	Guo Yukun (郭玉昆)	中国	广东	2278
338	100844	Li Shuo (李硕)	中国	黑龙江	2278
339	101799	Zhang Ziyi (张梓溢)	中国	广东	2276
340	010306	Yamaoka Kentaro (山冈显太郎)	日本	福冈	2276
341	101358	Wen Yongcai (温永彩)	中国	河南	2275
342	101139	Zhang Zhihao (张郅皓)	中国	北京	2274
343	020380	Myasoyedov Yevgeni (梅索耶多松·叶夫根尼)	俄罗斯	雷宾斯克	2273
344	020978	Kazantsev Konstantin (卡赞采夫·康斯坦丁)	俄罗斯	波久加	2272
345	101793	Liu Jiasheng (刘嘉圣)	中国	广东	2272
346	101445	Wu Kaihe (吴开河)	中国	广东	2271
347	090121	Piik Sander (皮克·桑德尔)	爱沙尼亚	塔林	2271
348	020414	Yudina Maria (尤金娜·玛丽亚)	俄罗斯	波久加	2271
349	101452	Lin Guoling (林国玲)	中国	广东	2270
350	130061	Yang Seong-Mo (梁诚模)	韩国	京畿道	2268
351	101750	Wang Junkai (王俊锴)	中国	吉林	2268
352	130192	Park Seung Jun	韩国	首尔	2268
353	101195	Qin Shaoya (秦邵雅)	中国	江苏	2266
354	200003	Sun In (宣然)	中国澳门	　	2265
355	100911	Wang Weishi (王维实)	中国	河北	2264
356	100669	Chen Zimin (陈子敏)	中国	广东	2264
357	101497	Lin Ximeng (林熙蒙)	中国	北京	2264
358	101449	Fang Guanping (方关平)	中国	海南	2263
359	101421	Zhang Xiaoxia (张晓霞)	中国	江苏	2261
360	020217	Volkov Sergey (沃尔科夫·谢尔盖)	俄罗斯	雷宾斯克	2261
361	101320	Ma Wangyue (马望越)	中国	上海	2260
362	100741	Cao Shuang (曹霜)	中国	重庆	2260
363	101526	Fan Yutian (樊宇天)	中国	湖北	2260
364	090073	Mirme Madli (米尔梅·玛德莉)	爱沙尼亚	塔林	2259
365	101196	Zhang Muyi (张沐忆)	中国	江苏	2259
366	100948	Zhang Yunshu (张云舒)	中国	上海	2258
367	101463	Dong Jiayi (董家怡)	中国	浙江	2258
368	200012	Lee Chi Son (李子舜)	中国澳门	　	2257
369	020894	Stoyanov Egor (斯托亚诺夫·叶戈尔)	俄罗斯	波久加	2253
370	100860	Zhao Yan (赵严)	中国	河南	2253
371	101800	Guo Weihua (郭伟华)	中国	广东	2252
372	090052	Väljataga Paul (瓦尔雅塔加·保罗)	爱沙尼亚	塔林	2251
373	020780	Stoyanov Kirill (斯托亚诺夫·基里尔)	俄罗斯	波久加	2250
374	101429	Shen Tianyou (沈天佑)	中国	浙江	2248
375	021024	Kinelovskiy Nikita (基涅洛夫斯基·尼基塔)	俄罗斯	莫斯科	2248
376	102332	Qiu Wuxiang (邱吴祥)	中国	江苏	2247
377	101325	Huang Lina (黄李娜)	中国	浙江	2243
378	100482	Wang Qian (王骞)	中国	重庆	2242
379	100403	Guo Haisen (郭海森)	中国	安徽	2242
380	101330	Tong Chen (童晨)	中国	安徽	2240
381	101770	Zhao Yubin (赵钰彬)	中国	浙江	2240
382	101250	Liu Jinfeng (刘晋峰)	中国	天津	2238
383	010164	Maruta Hiroki (丸田浩贵)	日本	东京	2234
384	100982	Lin Xinpeng (林鑫鹏)	中国	江苏	2234
385	100479	Liu Hongping (刘洪平)	中国	陕西	2233
386	101140	Huang Yi (黄毅)	中国	广东	2233
387	100040	Hou Jun (侯军)	中国	江苏	2233
388	101675	Zhu Yi (朱乙)	中国	江苏	2232
389	130062	Park Sang-Hyeon (朴相炫)	韩国	大邱	2232
390	101302	Yu Xiaomi (喻小米)	中国	北京	2229
391	020627	Semenov Oleg (谢苗诺夫·奥列格)	俄罗斯	波久加	2229
392	100079	Hua Tao (华韬)	中国	北京	2228
393	010096	Kusajima Masato (草岛真人)	日本	宫城	2228
394	130182	Park Doyoung	韩国	大田	2228
395	110030	Yeh Sheng-Heng (叶晟亨)	中国台湾	台中	2225
396	101525	Fu Zhixuan (傅之轩)	中国	浙江	2224
397	010355	Yoshida Hisao (吉田久夫)	日本	　	2222
398	010077	Maruyama Yasushi (丸山保司)	日本	滨松	2222
399	010050	Takazawa Nagayoshi (高泽永吉)	日本	清水	2221
400	100466	Wu Baogang (吴保刚)	中国	江苏	2220
401	100787	Shi Qiaochu (施翘楚)	中国	浙江	2219
402	101035	Zhou Yicheng (周奕成)	中国	北京	2219
403	130140	Hwang In-hyeok	韩国	　	2218
404	020070	Semyonov Vladimir (谢苗诺夫·弗拉基米尔)	俄罗斯	圣彼得堡	2217
405	101407	Zhang Cong (张丛)	中国	河北	2217
406	101146	Yang Wenjun (杨文钧)	中国	北京	2216
407	010421	Toyo Koryu (东阳晃龙)	日本	京都	2216
408	101428	Zhang Tianyu (张天瑜)	中国	江苏	2214
409	101881	Zhang Yan (张晏)	中国	上海	2213
410	101547	Li Zirui (李子睿)	中国	四川	2213
411	100753	Hao Tianyi (郝天一)	中国	北京	2213
412	101486	Liu Xiangbo (刘相伯)	中国	江苏	2212
413	101200	Zhang-Gu Wenyu (张顾雯钰)	中国	江苏	2209
414	200011	Lei Un Hou (李源浩)	中国澳门	　	2208
415	150144	Háša Miroslav (哈沙·米罗斯拉夫)	捷克	布拉格	2208
416	101109	Yang Lin (杨淋)	中国	北京	2208
417	010389	Kito Shinichi (纪藤真一)	日本	堺市	2207
418	102125	Xue Xinze (薛鑫泽)	中国	北京	2207
419	130267	Lee Da hoon	韩国	首尔	2206
420	101340	Song Ruiyang (宋睿洋)	中国	浙江	2206
421	010365	Nishizawa Aoi (西泽碧生)	日本	新潟	2206
422	020770	Yusupmurzin Danila (尤苏普穆尔津·丹尼拉)	俄罗斯	波久加	2203
423	101544	Li Zihan (李梓翰)	中国	四川	2203
424	130178	Lee Jong bin (李钟彬)	韩国	首尔	2202
425	101498	Liu Longbo (柳泷博)	中国	北京	2202
426	010386	Hayashi Shoichi (林昭一)	日本	尼崎	2202
427	101305	Liu Shuzheng (刘书正)	中国	北京	2201
428	101703	Ma Ye (马也)	中国	黑龙江	2201
429	101271	Che Baikang (车百康)	中国	吉林	2201
430	101576	Wu Yanhao (邬彦皓)	中国	四川	2200
431	010109	Matsui Tsunehiro (松井恒弘)	日本	龙野	2200
432	110059	Liu Yi-Chung (刘议中)	中国台湾	台北	2200
433	101065	Li Xiaofang (李晓芳)	中国	广东	2199
434	010062	Maruta Koji (丸田光治)	日本	东京	2199
435	100898	Cao Xueyu (曹雪钰)	中国	北京	2199
436	100768	Wang Qingle (王清乐)	中国	重庆	2199
437	100433	Wu Xiaoning (吴晓宁)	中国	北京	2198
438	130208	Ahn Ye seung	韩国	　	2198
439	010043	Sakamoto Suzan (阪本弘氏)	日本	大阪	2196
440	180001	Pestov Arseni (佩斯托夫·阿尔谢尼)	希腊	哈尼亚	2195
441	200010	Lau Hou Ioi (刘澔叡)	中国澳门	　	2194
442	020830	Sadova Taisia (萨多娃·泰西亚)	俄罗斯	下诺夫哥罗德	2192
443	090155	Koni Kirke (科尼·柯克)	爱沙尼亚	塔林	2191
444	101875	Long Xinhua (龙鑫华)	中国	湖南	2190
445	020208	Alexejev Valentin (阿列克谢耶夫·瓦伦丁)	俄罗斯	库尔斯克	2190
446	101542	Bian Yuchen (卞雨晨)	中国	四川	2187
447	101538	Jiang Xiaoyu (江筱瑜)	中国	浙江	2187
448	100207	Huang Xiuyi (黄修一)	中国	北京	2186
449	101545	Wei Ziqi (魏子淇)	中国	江苏	2185
450	101063	Li Zhuowen (李​卓纹)	中国	吉林	2184
451	101796	Song Lingjia (宋翎嘉)	中国	广东	2182
452	101672	Wen Ying (文英)	中国	辽宁	2181
453	100845	Guo Song (郭松)	中国	吉林	2181
454	130165	Kim Doh Hyoung	韩国	全罗南道	2179
455	101878	Wang Simiao (王思淼)	中国	山东	2178
456	100246	Zhang Chi (张弛)	中国	北京	2178
457	110182	Wu Cheng-Chang (吴政昌)	中国台湾	台北	2178
458	101202	Yang Haonan (杨昊楠)	中国	北京	2178
459	020748	Shabanova Darya (斯图洛娃·达里娅)	俄罗斯	波久加	2178
460	101877	Wu Hanyue (吴函樾)	中国	上海	2177
461	100647	Zhang Xiaoting (张潇婷)	中国	湖南	2177
462	090082	Olumets Erko (奥卢梅茨·埃尔科)	爱沙尼亚	塔林	2176
463	101567	Liu Yihan (刘伊涵)	中国	四川	2176
464	100023	Zhu Zhaoyun (朱兆云)	中国	江苏	2176
465	100359	Zhang Nan (张楠)	中国	天津	2175
466	010451	Yoshikawa Tomoki (吉川知希)	日本	东京	2174
467	020683	Karpov Fyodor (卡尔波夫·费奥多)	俄罗斯	科诺沙	2174
468	010239	Kataoka Mitsuaki (片冈光昭)	日本	佐贺	2173
469	101552	Li Yuening (李岳宁)	中国	江苏	2173
470	100406	Zhang Shichao (张世超)	中国	河北	2173
471	020686	Stulova Kristina (斯图洛娃·克里斯季娜)	俄罗斯	波久加	2173
472	101332	Xia Kaidi (夏楷迪)	中国	浙江	2172
473	020725	Kalnitsky Oleg (卡尔尼茨基·奥列格)	俄罗斯	圣彼得堡	2172
474	010416	Shimura Hiroki (志村广树)	日本	东京	2172
475	110181	Chan Hsuan-Wei (詹玄维)	中国台湾	高雄	2172
476	101013	Yu Zhiyang (于智洋)	中国	北京	2171
477	101261	Chen Guanhui (陈冠辉)	中国	广东	2171
478	100022	Yu Zhenlin (俞振林)	中国	江苏	2170
479	090023	Voznjuk Pavel (沃兹纽克·帕维尔)	爱沙尼亚	塔林	2170
480	110110	Lin Chi-Lin (林奇霖)	中国台湾	高雄	2170
481	102091	Su Zihang (苏梓航)	中国	浙江	2170
482	130064	Park Han-Ju (朴汉柱)	韩国	首尔	2169
483	021030	Chernyi Anton (切尔内·安东)	俄罗斯	莫斯科	2169
484	020227	Bushkowski Ludwik (布什科夫斯基·卢德维克)	俄罗斯	圣彼得堡	2168
485	101555	Song Xiaoying (宋晓颖)	中国	吉林	2168
486	020022	Ivanov Alexey (伊万诺夫·阿列克谢)	俄罗斯	莫斯科	2168
487	010410	Kishimoto Shogo (岸本祥吾)	日本	东京	2167
488	100328	Zhang Hongmei (张红梅)	中国	北京	2167
489	010285	Yoshida Naoto (吉田尚人)	日本	名古屋	2165
490	101466	Ma Yize (马亦泽)	中国	浙江	2163
491	020214	Salnikova Nonna (萨尔尼科娃·农纳)	俄罗斯	圣彼得堡	2162
492	100762	Yao Zhiyong (姚志勇)	中国	北京	2159
493	100790	Zhang Peipei (张培培)	中国	陕西	2159
494	100984	Liu Ming (刘铭)	中国	浙江	2158
495	020772	Glibin Aleksey (格利宾·阿列克谢)	俄罗斯	雷宾斯克	2157
496	090178	Narva Jaan Oskar (纳尔瓦·扬·奥斯卡)	爱沙尼亚	塔林	2156
497	101772	Chen Junhao (陈君浩)	中国	湖南	2156
498	101328	Wu Hongyi (吴泓一)	中国	浙江	2156
499	102246	Zheng Peidong (郑沛东)	中国	福建	2155
500	100809	Shi Xudong (史旭东)	中国	北京	2154
501	102181	Xie Haoyang (解皓阳)	中国	上海	2154
502	101539	Liu Changtong (刘昶彤)	中国	黑龙江	2154
503	101062	He Xian (何显)	中国	山东	2153
504	101301	Xiao Yikang (肖伊康)	中国	河北	2151
505	110028	Lin Chiao-Ying (林巧盈)	中国台湾	高雄	2151
506	101465	Zhu Libing (朱骊冰)	中国	浙江	2151
507	101714	Chi Yunze (迟运泽)	中国	山东	2151
508	101964	Zhang Fangzheng (张方正)	中国	北京	2149
509	010363	Sato Takuya (佐藤卓也)	日本	大分	2149
510	120014	Ikonen Jussi (伊科嫩·尤西)	芬兰	赫尔辛基	2148
511	040050	Umantsiv Roman (乌曼齐夫·罗曼)	乌克兰	马尼亚瓦	2146
512	021021	Pavlovskiy Egor (巴夫洛夫斯基·叶戈尔)	俄罗斯	波久加	2145
513	130020	Kim Su Chan	韩国	首尔	2144
514	101203	Zhao Lingxuan (赵凌璇)	中国	江苏	2142
515	090085	Lillemaa Argo (利雷马·阿尔古)	爱沙尼亚	塔林	2141
516	101880	Liang Sijie (梁思洁)	中国	浙江	2139
517	100333	Zhang Yu (张宇)	中国	北京	2137
518	101444	Meng Fanchen (孟凡尘)	中国	江苏	2135
519	130108	Lim Jeong-Hun	韩国	釜山	2135
520	030008	Andersson Tord (安德森·托得)	瑞典	乌普萨拉	2134
521	020961	Noskov Pavel (诺斯科夫·帕维尔)	俄罗斯	科诺沙	2132
522	101822	Shen Zhuosheng (沈卓晟)	中国	上海	2132
523	090193	Lääne Rauno (莱内·劳诺)	爱沙尼亚	塔林	2132
524	101882	Li Jinze (李金泽)	中国	重庆	2130
525	102058	Zhang Yuru (张裕茹)	中国	江苏	2129
526	130160	Kang Gwiyong	韩国	首尔	2128
527	100769	Chen Wei (陈伟)	中国	陕西	2127
528	130014	Kim Ju-Il	韩国	仁川	2127
529	101304	Shi Junfan (史钧帆)	中国	北京	2127
530	101272	Qu Zhaodong (曲照东)	中国	黑龙江	2126
531	101549	Liu Wenbo (刘文博)	中国	安徽	2123
532	101890	Jian Linze (简林泽)	中国	广东	2123
533	102093	Zhu Jiayuan (朱嘉圆)	中国	浙江	2122
534	010415	Suenaga Daiki (末永大贵)	日本	东京	2122
535	110043	Sung Pei-Jung (宋佩蓉)	中国台湾	台北	2120
536	021052	Kondakov Ilya (孔达科夫·伊利亚)	俄罗斯	莫斯科	2119
537	030133	Fanell Jan (法内尔·简)	瑞典	斯德哥尔摩	2118
538	130097	Seo Tae-woong	韩国	　	2118
539	010404	Shibano Ryunosuke (芝野龙之介)	日本	东京	2117
540	130052	Chang Kyoung-Jun	韩国	忠清南道	2117
541	101298	Liu Minyi (刘敏逸)	中国	浙江	2116
542	101564	Fan Yuqi (范钰琪)	中国	襄阳	2116
543	101779	Wang Chunpu (王春谱)	中国	湖北	2116
544	090211	Kaljola Kaur (卡廖拉·考尔)	爱沙尼亚	塔林	2115
545	101487	Zheng Wei (郑伟)	中国	江苏	2115
546	090042	Lillemets Rauni	爱沙尼亚	塔林	2114
547	101702	Zhang Zhenjia (张朕嘉)	中国	辽宁	2114
548	150119	Tesařík Štěpán	捷克	布拉格	2114
549	080038	Poghosyan Yeva	亚美尼亚	埃里温	2113
550	010301	Takagi Tomoyuki (高木朋之)	日本	东京	2113
551	010175	Tomobe Katsuhiro (友部胜弘)	日本	东京	2111
552	101453	Gao Jiaxuan (高嘉璇)	中国	辽宁	2111
553	010110	Yamamoto Yasuhiro (山本靖弘)	日本	滨松	2110
554	101585	Han Yirui (韩依锐)	中国	四川	2109
555	101404	Zhu Minghui (朱明辉)	中国	天津	2106
556	130209	Kim Na hyeon	韩国	　	2105
557	100102	Chen Ge (陈戈)	中国	湖南	2105
558	101884	Yao Mingyang (姚名杨)	中国	湖北	2105
559	101540	Niu Tianqi (牛天圻)	中国	山东	2104
560	130098	Choi Eun-seo	韩国	忠清南道	2103
561	100455	Yang Na (杨娜)	中国	河北	2103
562	101883	Zhu Keyi (朱珂依)	中国	重庆	2103
563	101973	Guo Kaiming (郭凯明)	中国	北京	2103
564	101546	Sun Chongjie (孙崇杰)	中国	江苏	2101
565	020858	Prokopyev Andrei (普罗科佩夫·安德烈)	俄罗斯	波久加	2100
566	040070	Skrypnyk Dmytro	乌克兰	马尼亚瓦	2100
567	101719	Ti Zeqing (提泽卿)	中国	天津	2100
568	100521	Shi Yutong (史玉彤)	中国	黑龙江	2099
569	102092	Miao Ruixin (缪芮馨)	中国	浙江	2099
570	090243	Nitov Nils (尼托夫·尼尔斯)	爱沙尼亚	绍埃	2099
571	020819	Naumov Egor (瑙莫夫·叶戈尔)	俄罗斯	波久加	2098
572	100103	Tian Hanfa (田汉法)	中国	北京	2097
573	090136	Reimand Hanna-Kai (赖曼德·汉娜-凯)	爱沙尼亚	塔林	2095
574	021005	Savvateev Mikhail (萨瓦捷耶夫·米哈伊尔)	俄罗斯	莫斯科	2095
575	010402	Fukada Ren (深田莲)	日本	滨松	2094
576	101866	Wu Binbin (吴彬彬)	中国	　	2094
577	021064	Vislovich Vladislav (维斯洛维奇·弗拉季斯拉夫)	俄罗斯	莫斯科	2093
578	010354	Ooshina Seiichi (大科清市)	日本	青森	2093
579	102063	Xu Pengwei (许鹏伟)	中国	江苏	2093
580	100833	Zhong Baogui (钟保贵)	中国	湖南	2092
581	021039	Belova Polina (别洛娃·波林娜)	俄罗斯	下诺夫哥罗德	2091
582	101396	Liang Haobo (梁浩博)	中国	北京	2091
583	020590	Kuleshov Mikhail (库列绍夫·米哈伊尔)	俄罗斯	圣彼得堡	2091
584	101136	Li Wenda (李闻达)	中国	湖南	2091
585	200080	Lan Chin U Kaylee (蓝芊羽)	中国澳门	　	2090
586	010197	Gakumazawa Hideaki (岳间泽秀明)	日本	岩手	2090
587	130072	Kim Seong-hyeon	韩国	庆尚南道	2090
588	101939	Xiong Xianrou (熊羡柔)	中国	广东	2088
589	101499	Zhou Tianyou (周天宥)	中国	北京	2088
590	010080	Hata Masayuki (畑雅幸)	日本	枚方	2088
591	101543	Ma Boshen (马铂沈)	中国	江苏	2087
592	101336	Chen Yue (陈月)	中国	浙江	2087
593	101584	Shen Rang (沈让)	中国	四川	2086
594	080032	Poghosyan Vahe	亚美尼亚	埃里温	2086
595	101550	Xu Bang (徐邦)	中国	江苏	2085
596	101797	Mai Kai (麦开)	中国	广东	2084
597	130083	Kwon Min-jae	韩国	世宗	2083
598	021045	Potapov Stepan (波塔波夫·斯捷潘)	俄罗斯	科诺沙	2082
599	101361	Wang Penghao (王鹏淏)	中国	河北	2081
600	130269	Choi Jun Hyeong	韩国	光州	2080
601	130245	Kim Hyeon-seop (金显燮)	韩国	首尔	2080
602	101220	Yuan Qixun (袁启珣)	中国	广东	2080
603	020808	Dyachkov Nikita (佳奇科夫·尼基塔)	俄罗斯	波久加	2080
604	101366	Lian Heqi (连鹤淇)	中国	河北	2079
605	010401	Yamane Tomohiro (山根友裕)	日本	山口	2079
606	200069	Wong Tek Kio (黄荻翘)	中国澳门	　	2078
607	010219	Fujikawa Masaki (藤川正树)	日本	大宫	2078
608	101836	Tang Ziqin (唐子钦)	中国	江苏	2077
609	101886	Liu Ruixi (刘芮西)	中国	重庆	2076
610	101442	Li Haoyang (李昊洋)	中国	黑龙江	2076
611	101889	Li Chengze (李承泽)	中国	河北	2075
612	080046	Yeganyan Alexander	亚美尼亚	埃里温	2075
613	101432	Wang Shaole (王邵乐)	中国	江苏	2073
614	020572	Sveshnikov Ilya (斯韦什尼科夫·伊利亚)	俄罗斯	雷宾斯克	2073
615	100396	Dai Ruzhou (戴如周)	中国	江苏	2072
616	100306	Wang Lin (王林)	中国	天津	2072
617	200013	Lao Chi Ieng (刘梓莹)	中国澳门	　	2070
618	100570	Lei Hongying (雷宏英)	中国	河北	2069
619	200018	Lei Pui Ieong (李沛扬)	中国澳门	　	2069
620	020826	Stulova Veronika (斯图洛娃·韦罗妮卡)	俄罗斯	波久加	2068
621	100572	Zeng Feige (曾飞戈)	中国	湖南	2067
622	021228	Kirsanov Platon	俄罗斯	雷宾斯克	2067
623	101885	Zhang Yufan (张雨帆)	中国	河南	2067
624	101888	Liu Siqi (刘思齐)	中国	宁夏	2067
625	020896	Fokichev Egor (福基切夫·叶戈尔)	俄罗斯	波久加	2067
626	021096	Leontiev Anton (列昂捷夫·安东)	俄罗斯	莫斯科	2067
627	101600	Zhang Zhiyi (张芷伊)	中国	四川	2066
628	010443	Yamamoto Ousuke (山本樱辅)	日本	横滨	2066
629	101966	Zhan Zipeng (詹子鹏)	中国	北京	2066
630	101566	Li Jinghui (李静辉)	中国	四川	2066
631	020996	Buslakova Anastasja (布斯拉科娃·阿纳斯塔西娅)	俄罗斯	波久加	2064
632	010411	Kawaai Hitoshi (川合仁)	日本	埼玉	2063
633	090127	Moor Karl-Mattias (摩尔·卡尔-马蒂亚斯)	爱沙尼亚	塔林	2063
634	101395	Gong Youchen (贡酉辰)	中国	北京	2062
635	101725	Zhang Xijie (张晰杰)	中国	北京	2062
636	200016	Feng Pak Tong Madison (冯柏潼)	中国澳门	　	2062
637	101375	Wu Lina (吴丽娜)	中国	四川	2061
638	100830	Li Yilong (李一龙)	中国	北京	2061
639	101468	Chen Zixuan (陈梓宣)	中国	浙江	2061
640	101504	Liu Yisheng (刘壹圣)	中国	北京	2060
641	101208	Zhou Ying (周迎)	中国	安徽	2060
642	090133	Murumaa Magnus (穆鲁马·马格努斯)	爱沙尼亚	库萨卢	2060
643	110002	Chen Lung-Chuan (陈隆泉)	中国台湾	台北	2059
644	101398	Zhu Zhengxu (朱烝绪)	中国	北京	2059
645	020737	Solotina Tatyana	俄罗斯	莫斯科	2059
646	101765	Zhuang Yixiang (庄义翔)	中国	上海	2058
647	200007	Chan Kam Chio (陈锦超)	中国澳门	　	2058
648	101887	Yang Ziting (杨紫婷)	中国	云南	2057
649	102271	Huang Yiming (黄一铭)	中国	广东	2056
650	101587	Li Yimeng (李伊檬)	中国	四川	2056
651	101787	Shi Yuxuan (史宇轩)	中国	湖北	2054
652	101588	Hu Yihan (胡艺晗)	中国	安徽	2054
653	101433	Tao Yiran (陶怿然)	中国	江苏	2053
654	020932	Simanovskaia Anastasia (西玛诺夫斯卡娅·阿纳斯塔西娅)	俄罗斯	波久加	2052
655	102203	Ling Xi (凌溪)	中国	江苏	2051
656	101751	Zhang Wenliang (张文亮)	中国	黑龙江	2051
657	090115	Holtsman Kris (霍尔茨曼·克里斯)	爱沙尼亚	塔林	2050
658	101569	Yang Ziyu (杨紫煜)	中国	河北	2050
659	101715	Shen Tianran (沈天然)	中国	山东	2049
660	100916	Liang Song (梁松)	中国	河南	2047
661	010427	Jitsufuji Hitoki (实藤阳秋)	日本	福冈	2047
662	101156	Wu Junlang (吴隽朗)	中国	广东	2047
663	100469	Wu Kan (吴侃)	中国	福建	2047
664	021034	Buslakova Darya (布斯拉科娃·达里娅)	俄罗斯	波久加	2046
665	100675	Chen Kaidi (陈凯迪)	中国	广东	2046
666	020914	Postnikov Dmitrii (波斯特尼科夫·德米特里)	俄罗斯	雷宾斯克	2045
667	101684	Zhou Zequn (周泽群)	中国	江苏	2043
668	020750	Shabanov Ruslan (沙巴诺夫·鲁斯兰)	俄罗斯	波久加	2041
669	010400	Maruyama Takashi (丸山贵志)	日本	东京	2039
670	101891	Hu Lin (胡琳)	中国	云南	2038
671	010437	Tokonami Shota (床泽翔太)	日本	大阪	2038
672	010174	Tanizaki Ryusuke (谷崎龙介)	日本	神奈川	2037
673	200160	Ho Cheng Lam (何静琳)	中国澳门	　	2036
674	101274	Li Xin (李鑫)	中国	黑龙江	2034
675	200020	Chu Ut Ieng (朱玥盈)	中国澳门	　	2034
676	101270	Zhao Xinye (赵新野)	中国	吉林	2033
677	101335	Zhang Yinuo (章一诺)	中国	浙江	2033
678	090191	Moisto Mairon (莫伊斯托·迈龙)	爱沙尼亚	塔林	2033
679	021074	Danilin Fedor (丹尼林·费多尔)	俄罗斯	莫斯科	2033
680	101794	Zhu Shilang (朱诗朗)	中国	广东	2033
681	101562	Su Pengyun (苏鹏蕴)	中国	四川	2032
682	010163	Tanno Yoshitaka (丹野好高)	日本	青森	2032
683	010067	Kato Yasuhiro (加藤康弘)	日本	东京	2031
684	101306	Yang Jingyu (杨敬禹)	中国	北京	2031
685	101500	Deng Yushu (邓羽舒)	中国	北京	2030
686	021171	Vershinin Ivan (韦尔希宁·伊万)	俄罗斯	沃洛格达	2030
687	102260	Huang Simi (黄思幂)	中国	广东	2029
688	080076	Poghosyan Davit	亚美尼亚	埃里温	2029
689	021031	Gershman Artem (格尔什曼·阿尔乔姆)	俄罗斯	莫斯科	2028
690	101225	Li Shixuan (李世轩)	中国	安徽	2028
691	010099	Kawate Kozo (川手耕造)	日本	广岛	2028
692	101604	Hu Yuhan (胡誉瀚)	中国	安徽	2027
693	010370	Masuda Taku (増田巧)	日本	名古屋	2027
694	101629	Luo Mingyan (罗明焱)	中国	湖北	2025
695	020851	Mityagin Anton (米佳金·安东)	俄罗斯	雷宾斯克	2024
696	101568	Wang Haoyan (汪昊妍)	中国	江苏	2023
697	090122	Tiivel Tuuli (季韦尔·图莉)	爱沙尼亚	塔林	2023
698	020838	Shangina Alexandra (尚金娜·亚历山德拉)	俄罗斯	波久加	2023
699	200095	Lai I Sam (赖以心)	中国澳门	　	2022
700	020695	Kachaeva Ilona (卡恰耶娃·伊洛娜)	俄罗斯	圣彼得堡	2022
701	101111	Wang Hao (王皓)	中国	吉林	2022
702	130153	Yoon Hong Hyeon	韩国	京畿道	2021
703	130262	Oh Jong-min	韩国	京畿道	2020
704	101773	Wu Yuhan (吴宇涵)	中国	湖南	2020
705	080087	Ordyan Rafael	亚美尼亚	埃里温	2020
706	030006	Maltell Tommy (马泰尔·托米)	瑞典	延雪平	2020
707	101894	Chen Rouyu (陈柔妤)	中国	重庆	2019
708	200148	Kuong Cheng In (邝正言)	中国澳门	　	2018
709	101603	Zhang Jieyan (张洁妍)	中国	江苏	2018
710	021078	Voronina Lyubov	俄罗斯	下诺夫哥罗德	2017
711	101892	Hong Chengzhi (洪承志)	中国	江西	2016
712	010426	Saito Shigetoshi (斋藤成利)	日本	千叶	2016
713	101561	Zhang Xinqi (张歆淇)	中国	河北	2014
714	100342	Sun Lijing (孙立京)	中国	北京	2013
715	101022	Wang Chunxu (王春旭)	中国	天津	2013
716	100697	Zhao Haixia (赵海霞)	中国	内蒙古	2013
717	110111	Lin Ching-Chieh (林敬杰)	中国台湾	高雄	2012
718	101673	Ding Kailun (丁楷伦)	中国	　	2012
719	101501	Hu Jiayi (胡家祎)	中国	北京	2012
720	010435	Kobayashi Nanako (小林菜菜子)	日本	埼玉	2010
721	200211	Ding Seong Wan (丁相匀)	中国澳门	　	2009
722	020916	Arzybov Vladislav (阿尔济博夫·弗拉季斯拉夫)	俄罗斯	下诺夫哥罗德	2008
723	090129	Heidmets Mark (海德梅茨·马克)	爱沙尼亚	塔林	2007
724	101023	Li Xuezhu (李雪竹)	中国	北京	2006
725	102126	Xu Jiajun (许嘉俊)	中国	北京	2005
726	200170	Leong Chon Meng (梁晋铭)	中国澳门	　	2005
727	200068	Choi Chi Lok (徐旨乐)	中国澳门	　	2005
728	200017	Ho Nok Hin Issac (何诺轩)	中国澳门	　	2003
729	021087	Porokhina Natalya (波罗希娜·纳塔利娅)	俄罗斯	波久加	2003
730	200025	Ng Cheng Hei (伍政禧)	中国澳门	　	2002
731	020730	Rumyantseva Ekaterina (鲁米扬采娃·叶卡捷琳娜)	俄罗斯	圣彼得堡	2002
732	021079	Sokolov Andrei (索科洛夫·安德烈)	俄罗斯	科诺沙	2001
733	021026	Volskaya Darya (沃尔斯卡娅·达里娅)	俄罗斯	科诺沙	2000
734	101636	Yin Yifan (尹一帆)	中国	河北	2000
735	101229	Fan Zhiyi (范智宜)	中国	安徽	1999
736	130214	Park Se Hoon	韩国	　	1999
737	101300	Yu Jiuning (喻九宁)	中国	北京	1997
738	102096	Fu Yankai (傅彦凯)	中国	浙江	1997
739	101365	Wang Bingxiang (王昺翔)	中国	内蒙古	1997
740	130084	Park Jong hyun	韩国	　	1996
741	101148	Pan Yixuan (潘奕璇)	中国	广东	1995
742	101488	Wang Ruixi (王睿希)	中国	江苏	1995
743	101676	Zhu Dong (朱栋)	中国	江苏	1995
744	020761	Vohtomina Vladislava (沃赫托明娜·弗拉季斯拉娃)	俄罗斯	波久加	1994
745	021054	Linich Anastasia (利尼奇·阿纳斯塔西娅)	俄罗斯	莫斯科	1994
746	021040	Strakulia Lev (斯特拉库利亚·列夫)	俄罗斯	莫斯科	1993
747	110032	Huang Sheng-Hsun (黄圣勋)	中国台湾	台北	1993
748	090212	Peri Karl Peeter (佩里·卡尔·彼得)	爱沙尼亚	塔林	1992
749	020751	Prokopets Tatyana (普罗科佩茨·塔季扬娜)	俄罗斯	波久加	1991
750	090220	Kuzmin Dmitri (库兹明·德米特里)	爱沙尼亚	塔林	1990
751	021042	Barinov Rendom (巴里诺夫·伦多姆)	俄罗斯	莫斯科	1990
752	101224	Wang Hengrui (王恒瑞)	中国	山西	1990
753	200022	Chan Seong Ieong (陈上扬)	中国澳门	　	1988
754	101721	Liang Jinsheng (梁金生)	中国	河北	1987
755	200037	Lei Sin Wang (李善弘)	中国澳门	　	1986
756	010330	Kato Daisuke (加藤大介)	日本	滨松	1986
757	100298	Wang Hongjun (王洪军)	中国	天津	1986
758	100758	Chen Hong (陈鸿)	中国	福建	1985
759	040067	Verholiak Yuri	乌克兰	Ivano-Frankivsk	1984
760	101893	Liu Jun (刘珺)	中国	山西	1983
761	130194	Han Byeong Seon	韩国	忠清南道	1982
762	200027	Cheong Sio Fong (张兆锋)	中国澳门	　	1982
763	101253	Liu Ran (刘然)	中国	北京	1981
764	101607	Fan Yuxin (范雨鑫)	中国	襄阳	1981
765	010405	Kato Shota (加藤翔太)	日本	东京	1980
766	021114	Rogozinsky Jaroslav (罗戈津斯基·雅罗斯拉夫)	俄罗斯	波久加	1979
767	200015	Chan Seong Lai (陈上礼)	中国澳门	　	1978
768	110189	Chuang Yu-Liang (庄友良)	中国台湾	台北	1977
769	200021	Wong Hio Kei (黄晓淇)	中国澳门	　	1977
770	101308	Chen Tingyue (陈亭玥)	中国	北京	1974
771	130141	Kim Han Byeol	韩国	忠清南道	1974
772	101490	Lan Xinlei (兰昕蕾)	中国	江苏	1973
773	101502	Sun Peigang (孙培刚)	中国	北京	1973
774	100902	Liao Yi (廖懿)	中国	湖南	1972
775	101723	Feng Dongyi (封东邑)	中国	河北	1971
776	101978	Hao Peiyuan (郝培源)	中国	北京	1970
777	040066	Ulan Oleksandr	乌克兰	利沃夫	1970
778	100985	Wang Jiayi (王佳怡)	中国	山东	1969
779	100968	Xu Yepeng (许业鹏)	中国	海南	1968
780	020900	Vostriakova Yulia (沃斯特里亚科娃·尤利娅)	俄罗斯	波久加	1967
781	101895	Wang Zhiqi (王芷奇)	中国	重庆	1967
782	102094	Luo Hang (罗杭)	中国	浙江	1966
783	010090	Fujii Naoki (藤井直树)	日本	福冈	1966
784	020946	Sonina Vladislava (索宁娜·弗拉迪斯拉娃)	俄罗斯	雷宾斯克	1966
785	021201	Znamensky Andrej	俄罗斯	雷宾斯克	1966
786	021060	Zolotarev Konstantin (佐洛塔列夫·康斯坦丁)	俄罗斯	科诺沙	1966
787	101897	Li Ziyue (李梓钺)	中国	河南	1965
788	100864	Tao Tao (陶涛)	中国	江苏	1965
789	200165	Ng Chon Hou (伍俊豪)	中国澳门	　	1964
790	200019	Huang Pou Fai (黄宝辉)	中国澳门	　	1963
791	021065	Nikitina Darina (尼基蒂娜·达琳娜)	俄罗斯	波久加	1962
792	101898	Wang Manni (王曼妮)	中国	河南	1962
793	021038	Berdiy Arseniy (别尔季·阿尔谢尼)	俄罗斯	莫斯科	1960
794	101591	Su Zijing (苏紫敬)	中国	河北	1960
795	101611	Yang Yifei (杨镒菲)	中国	河北	1960
796	101608	Zhong Junwei (钟隽为)	中国	四川	1960
797	101896	Zhao Lindun (赵林惇)	中国	陕西	1959
798	200024	Leong Ka Wang (梁家荣)	中国澳门	　	1958
799	102051	Lyu Runsheng (吕润生)	中国	天津	1958
800	021055	Churikova Daria (丘里科娃·达里娅)	俄罗斯	莫斯科	1957
801	020765	Novikova Daria (诺维科娃·达里娅)	俄罗斯	波久加	1957
802	100846	Yuan Xuepeng (袁雪鹏)	中国	黑龙江	1957
803	101633	Li Jiuyan (李九言)	中国	四川	1956
804	090198	Mumm Kristina (穆姆·克里斯季娜)	爱沙尼亚	科尔加	1956
805	101310	Jin Ge (金戈)	中国	北京	1956
806	080091	Tonoyan Hrant	亚美尼亚	埃里温	1955
807	101110	Lyu Yan (吕彦)	中国	北京	1954
808	010409	Noda Seiya (野田诚也)	日本	名古屋	1953
809	101586	Zhang Shouchang (张守畅)	中国	山东	1952
810	190019	Eryilmaz Emir Mehmet (埃里尔马兹·埃米尔·穆罕默德)	土耳其	伊斯坦布尔	1951
811	021025	Gorbachev Daniil (戈尔巴乔夫·丹尼尔)	俄罗斯	莫斯科	1950
812	021069	Karavaeva Maria (卡拉瓦耶娃·玛丽亚)	俄罗斯	下诺夫哥罗德	1950
813	010441	Suzuki Yoshitaka (铃木由崇)	日本	东京	1950
814	200162	Chan Chi San Clayton (陈梓燊)	中国澳门	　	1949
815	110216	Yao Chun-Ta (姚均达)	中国台湾	台北	1949
816	020918	Valinkin Andrei (瓦林金·安德烈)	俄罗斯	雷宾斯克	1949
817	101681	Ma Zhenyi (马蓁怡)	中国	江苏	1948
818	200163	Choi Cheok Io Oscar (蔡倬尧)	中国澳门	　	1948
819	130203	Kim Ha-Ul	韩国	　	1948
820	021009	Shkarupa Maria (什卡鲁帕·玛丽亚)	俄罗斯	下诺夫哥罗德	1947
821	101902	Zhang Yitian (张易恬)	中国	河南	1945
822	100363	Sun Qian (孙倩)	中国	天津	1943
823	102185	Zhu Zhenjun (朱震军)	中国	湖北	1943
824	200166	Mak Chun Ngai (麦俊毅)	中国澳门	　	1942
825	021066	Letovaltsev Metvei (莱托瓦采夫·梅特维)	俄罗斯	科诺沙	1942
826	200071	Lou Lok Iao (卢乐悠)	中国澳门	　	1939
827	040062	Saik Oleksiy	乌克兰	Ternopil	1939
828	200028	Yuan Pui Peng (袁沛平)	中国澳门	　	1939
829	100693	Han Yu (韩宇)	中国	河北	1938
830	110253	Chang Tsung-Hao (张棕皓)	中国台湾	新竹	1937
831	200023	Lei Ian Cheng (李甄正)	中国澳门	　	1937
832	101900	Zhang Xinrui (张芯蕊)	中国	山西	1935
833	021113	Zubov Vsevolod (祖博夫·弗谢沃洛德)	俄罗斯	阿尔汉格尔斯克	1934
834	021080	Ozerov Denis (奥泽罗夫·丹尼斯)	俄罗斯	科诺沙	1934
835	101916	Hu Yiyi (胡一一)	中国	北京	1931
836	090018	Karlsson Irene (卡尔森·艾琳)	爱沙尼亚	塔林	1929
837	101609	Gong Yuecheng (龚悦诚)	中国	广东	1929
838	101944	Chen Yiming (陈奕铭)	中国	广东	1928
839	040073	Ostrovskyi Bohdan	乌克兰	利沃夫	1926
840	100112	Ma Shiwei (马世卫)	中国	北京	1925
841	101686	Xu Xiya (徐夕雅)	中国	江苏	1925
842	010424	Ide Daisuke (井出大辅)	日本	东京	1925
843	200039	Ho In Lok (何彦乐)	中国澳门	　	1925
844	090259	Tammaru Taavi (塔马鲁·塔维)	爱沙尼亚	塔林	1925
845	101957	Zhong Tianze (钟天泽)	中国	江苏	1924
846	090262	Tuul Tristan Tormi (图尔·特里斯坦·托尔米)	爱沙尼亚	拉格里	1923
847	101904	Yang Zijun (杨子珺)	中国	重庆	1923
848	130035	Jeong Gi-Yong	韩国	首尔	1922
849	101399	Chen Jiayi (陈嘉逸)	中国	北京	1922
850	101731	Lin Xuanyu (林晅羽)	中国	北京	1921
851	080090	Pipoyan Nelli	亚美尼亚	埃里温	1921
852	020904	Kozhevin Dmitry (科热文·德米特里)	俄罗斯	科诺沙	1921
853	090053	Sepman Siim (塞普曼·西姆)	爱沙尼亚	塔林	1920
854	200030	Leong Chit Seong (梁哲尚)	中国澳门	　	1919
855	021120	Kareyev Radomir (卡列耶夫·拉多米尔)	俄罗斯	下诺夫哥罗德	1919
856	102097	Chen Zeyi (陈则亦)	中国	浙江	1919
857	200050	Chu Hio Ieng (朱晓莹)	中国澳门	　	1919
858	020997	Semenov Andrei (谢苗诺夫·安德烈)	俄罗斯	科诺沙	1917
859	020998	Yudina Polina (尤金娜·波林娜)	俄罗斯	科诺沙	1917
860	030043	Nyberg Bengt (尼伯格·本特)	瑞典	米约尔比	1916
861	200033	Chan Lok Kei (陈乐祈)	中国澳门	　	1915
862	021023	Zvezdina Nataliya (兹维兹迪娜·娜塔莉亚)	俄罗斯	波久加	1914
863	101789	Xu Haiyou (徐海祐)	中国	江苏	1913
864	101503	Yan Jingyi (闫静祎)	中国	北京	1912
865	200084	Cheong Chi Lok (张梓乐)	中国澳门	　	1912
866	020915	Reznik Grigorii (雷兹尼克·格里戈里)	俄罗斯	雷宾斯克	1911
867	102234	Chen Junyu (陈俊宇)	中国	江苏	1910
868	101592	Fu Zixuan (傅紫萱)	中国	浙江	1908
869	101679	Zhang Yuyang (张渝杨)	中国	江苏	1908
870	101450	Ge Yuwei (葛雨薇)	中国	湖南	1907
871	010449	Horikawa Yasuto (堀川泰人)	日本	Koriyama	1907
872	200220	Ieong Seong Lam (杨尚霖)	中国澳门	　	1907
873	021006	Roginski Roman (罗金斯基·罗曼)	俄罗斯	莫斯科	1906
874	200094	Lio Hoi Lam (廖铠岚)	中国澳门	　	1906
875	100266	Li Jie (李婕)	中国	天津	1905
876	101438	Meng Sitong (孟思彤)	中国	江苏	1903
877	010447	Takahashi Yutaka (高桥丰)	日本	福冈	1903
878	101174	Nie Hehong (聂赫宏)	中国	天津	1902
879	100862	Wang Chen (王琛)	中国	浙江	1901
880	010417	Okada Akihiro (冈田章宏)	日本	东京	1901
881	110208	Chang Yu-Chuan (张育铨)	中国台湾	台中	1900
882	101906	Liu Linjun (刘林君)	中国	河南	1900
883	101493	Zhang Xintian (张心甜)	中国	江苏	1900
884	101347	Wang Yue (王悦)	中国	天津	1900
885	200090	Leong Seong Lon (梁尚麟)	中国澳门	　	1898
886	030059	Karlsson Martin (卡尔森·马丁)	瑞典	延雪平	1898
887	100810	Yu Ning (于宁)	中国	北京	1897
888	100415	Guo Xinlu (郭馨璐)	中国	河北	1897
889	021131	Rozhkani Albert (罗日卡尼·阿尔伯特)	俄罗斯	雅罗斯拉夫尔	1897
890	102059	Zhou Chuqiao (周楚乔)	中国	江苏	1896
891	130253	Lee Geun-baek	韩国	京畿道	1895
892	200036	Lam Hei Ieong (林晞阳)	中国澳门	　	1894
893	020955	Andreev Sergey	俄罗斯	特维尔	1893
894	010403	Ito Tadashi (伊藤忠)	日本	名古屋	1890
895	200032	Mak Chon Hei (麦俊希)	中国澳门	　	1890
896	101596	Yang Haozhe (杨皓哲)	中国	河北	1890
897	130246	Park Dae-won	韩国	仁川	1889
898	090221	Nitov Melissa (尼托夫·梅利莎)	爱沙尼亚	绍埃	1889
899	102095	Zhu Jiaming (朱嘉铭)	中国	浙江	1889
900	102098	Xiang Zirui (项梓芮)	中国	浙江	1889
901	101683	Yang Xuerui (杨学睿)	中国	江苏	1888
902	010460	Nishida Naoki (西田直树)	日本	桑名	1888
903	101905	Peng Qiufu (彭秋傅)	中国	重庆	1888
904	101159	Zhou Xiaoyan (周笑妍)	中国	北京	1888
905	102100	Xing Shuyu (邢书瑜)	中国	浙江	1888
906	200034	Cheang Ian Tong (郑铟彤)	中国澳门	　	1888
907	101505	Feng Xiduo (冯玺多)	中国	北京	1886
908	200089	Cheong Chan Hei (张禛熹)	中国澳门	　	1884
909	101908	Yuan Mengxin (袁孟新)	中国	内蒙古	1882
910	200087	Chan Ian Kio (陈茵荞)	中国澳门	　	1881
911	101976	Lu Yihan (陆一瀚)	中国	江苏	1881
912	200149	Chu Ut Cheng (朱玥澄)	中国澳门	　	1880
913	200102	Leong Iat Seng (梁日诚)	中国澳门	　	1880
914	020839	Kulin Maxim (库林·马克西姆)	俄罗斯	波久加	1879
915	021076	Mikhalitsyn Matvey (米哈利岑·马特维)	俄罗斯	下诺夫哥罗德	1876
916	200038	Pun Hio Lok (潘晓乐)	中国澳门	　	1875
917	110102	Kuo Sheng-Pin (郭盛滨)	中国台湾	台北	1875
918	101909	Ren Shuxian (任书娴)	中国	河南	1875
919	020950	Danilov Daniil (丹尼洛夫·丹尼尔)	俄罗斯	雷宾斯克	1874
920	021110	Voronina Daria (沃罗尼娜·达里娅)	俄罗斯	下诺夫哥罗德	1871
921	101705	Qiu Shuang (邱爽)	中国	黑龙江	1871
922	010438	Morishita Hiroyoshi (森下弘祥)	日本	长崎	1871
923	021158	Vereshagina Valeria (韦列沙吉娜·瓦列里娅)	俄罗斯	科诺沙	1870
924	010272	Kawada Miki (川田美纪)	日本	滨松	1870
925	021075	Litvak Sofia (利特瓦克·索菲娅)	俄罗斯	下诺夫哥罗德	1869
926	101506	Wang Yiqi (王亦奇)	中国	北京	1869
927	090186	Pukk Martin (普克·马丁)	爱沙尼亚	塔林	1868
928	200167	Lai Ieok Kio (黎若翘)	中国澳门	　	1867
929	200150	Ung Ngai Chi (吴羿驰)	中国澳门	　	1867
930	021111	Mochanov Nikolay (莫恰诺夫·尼古拉)	俄罗斯	下诺夫哥罗德	1867
931	102099	Yao Yuanhan (姚元瀚)	中国	浙江	1866
932	101911	Ning Zixuan (宁子璇)	中国	湖南	1865
933	200072	Kong Iok Teng (孔钰婷)	中国澳门	　	1864
934	010391	Ito Midori (M)	日本	东京	1864
935	130204	Kim Kang-hyeon	韩国	首尔	1862
936	020976	Stulova Alisa (斯图洛娃·艾丽莎)	俄罗斯	波久加	1859
937	090215	Ilu Oliver (伊卢·奥利弗)	爱沙尼亚	塔林	1859
938	200042	Ip Lai Soi (叶礼瑞)	中国澳门	　	1858
939	090132	Kolk Mari (科尔克·玛丽)	爱沙尼亚	库雷萨雷	1857
940	101492	Zhang Qingyang (张清杨)	中国	江苏	1856
941	200214	Lee Nok Sam (李诺琛)	中国澳门	　	1855
942	200097	Wong Chon Hin (王俊轩)	中国澳门	　	1855
943	080092	Bulghadaryan Tigran	亚美尼亚	埃里温	1855
944	130198	Choi Gi Pyeong	韩国	仁川	1854
945	101610	Shan Yanfei (单彦菲)	中国	湖南	1854
946	010369	Kishi Yoshinori (岸善德)	日本	名古屋	1854
947	200111	Tam I Him Marcus (谭易谦)	中国澳门	　	1854
948	090154	Pukk Oskar (普克·奥斯卡)	爱沙尼亚	塔林	1853
949	080020	Sahakyan Tigran	亚美尼亚	埃里温	1853
950	021099	Chernetsova Ekaterina (切尔涅佐娃·叶卡捷琳娜)	俄罗斯	莫斯科	1851
951	020974	Galochkin Sergey (加洛奇金·谢尔盖)	俄罗斯	圣彼得堡	1851
952	102052	Zhao Ying (赵莹)	中国	北京	1850
953	101903	Gao Yuxuan (高宇暄)	中国	浙江	1850
954	200040	Wong Hou Cheng (黄灏正)	中国澳门	　	1850
955	101409	Han Ning (韩宁)	中国	天津	1849
956	021097	Marushev Ilya (马鲁晓夫·伊利亚)	俄罗斯	雅罗斯拉夫尔	1849
957	101645	Zhou Xuhong (周旭红)	中国	陕西	1848
958	021059	Nikolaev Mikhail (尼古拉耶夫·米哈伊尔)	俄罗斯	波久加	1846
959	200183	Yin Chi Lai (殷子蠡)	中国澳门	　	1846
960	200106	Chiang Hou Ian (郑昊昕)	中国澳门	　	1845
961	021130	Kokovin Nikolay (科科温·尼古拉)	俄罗斯	雅罗斯拉夫尔	1845
962	021027	Vereshagin Dmitrii (维列夏金·德米特里)	俄罗斯	科诺沙	1844
963	102054	Guo Caiqing (郭采卿)	中国	北京	1842
964	200047	Tsui Lok Chun (徐乐津)	中国澳门	　	1842
965	101087	Zong Yicheng (宗益成)	中国	广东	1841
966	020926	Bykov Dmitrii (比科夫·德米特里)	俄罗斯	波久加	1839
967	021057	Orlov Maxim (奥尔洛夫·马克西姆)	俄罗斯	科诺沙	1838
968	100904	Zhu Yan (朱严)	中国	北京	1838
969	200070	Lee Hoi Lok (李栩乐)	中国澳门	　	1838
970	101912	Zhou Kaixin (周楷焮)	中国	重庆	1838
971	021109	Filipenkov Mikhail (菲利彭科夫·米哈伊尔)	俄罗斯	莫斯科	1837
972	100878	Li Huan (李欢)	中国	安徽	1835
973	200046	Chen He Xun (陈鹤珣)	中国澳门	　	1835
974	200044	Leong Hoi Cheng (梁凯晴)	中国澳门	　	1834
975	101635	Wang Fangyuan (王芳原)	中国	四川	1833
976	200043	Ng Hao Him (吴孝谦)	中国澳门	　	1832
977	101914	Wang Sirong (王思嵘)	中国	江苏	1831
978	130222	Choi Min Gwan	韩国	庆尚北道	1830
979	101706	Han Yitong (韩一僮)	中国	黑龙江	1828
980	040072	Skrypnyk Vasyl	乌克兰	马尼亚瓦	1828
981	100487	Zhang Chunxia (张春霞)	中国	河南	1827
982	200093	Lau Chi Iao (刘梓渘)	中国澳门	　	1827
983	090210	Lääne Kristjan (莱内·克里斯蒂安)	爱沙尼亚	塔林	1825
984	101965	Chang Xin (常新)	中国	北京	1825
985	200195	Wong Chon Meng (黄儁铭)	中国澳门	　	1823
986	200051	Cheng Seng Hei (郑承熹)	中国澳门	　	1823
987	090273	Veer Mihkel	爱沙尼亚	萨库	1823
988	021145	Solomatina Ekaterina (索洛马京娜·叶卡捷琳娜)	俄罗斯	下诺夫哥罗德	1822
989	020951	Pushkin Ivan (普希金·伊万)	俄罗斯	雷宾斯克	1822
990	080086	Minasyan Gagik	亚美尼亚	埃里温	1822
991	020999	Puzanov Georgi (普扎诺夫·格奥尔基)	俄罗斯	莫斯科	1822
992	101415	Huang Jinyu (黄金钰)	中国	天津	1819
993	021133	Romanov Alexander (罗曼诺夫·亚历山大)	俄罗斯	雅罗斯拉夫尔	1817
994	101707	Wu Shang (吴尚)	中国	黑龙江	1815
995	021098	Tikhomirov Artem (季霍米罗夫·阿尔乔姆)	俄罗斯	雅罗斯拉夫尔	1814
996	021010	Kochanov Vasily (科恰诺夫·瓦西里)	俄罗斯	莫斯科	1814
997	020921	Kazanina Daria (卡萨尼娜·达里娅)	俄罗斯	雷宾斯克	1814
998	021153	Sankovsky Arseniy (桑科夫斯基·阿尔谢尼)	俄罗斯	阿尔汉格尔斯克	1813
999	101788	Zhang Yunruo (张芸箬)	中国	北京	1813
1000	200052	Si I Kong (施懿罡)	中国澳门	　	1812
1001	101967	Zhao Tianyu (赵天瑜)	中国	河北	1812
1002	010364	Masuda Yuuto	日本	堺市	1812
1003	101969	Meng Quancheng (孟泉成)	中国	天津	1811
1004	200099	Takenouchi Kazuki (竹之内一希)	中国澳门	　	1811
1005	021070	Sinjavsky Evgeny	俄罗斯	Sevastopol	1809
1006	200048	Chong Man Nok (钟汶诺)	中国澳门	　	1808
1007	101918	Tong Yao (童瑶)	中国	湖南	1808
1008	101981	Zhou Sihan (周思涵)	中国	江苏	1808
1009	200175	Sio Cheng Wa (萧正铧)	中国澳门	　	1808
1010	200156	Yik Chi Hei Jadyn (易沚禧)	中国澳门	　	1806
1011	200035	Fong Ut In (冯悦贤)	中国澳门	　	1805
1012	080082	Ayrapetyan Gevorg	亚美尼亚	埃里温	1805
1013	102056	Wang Yuqing (王昱青)	中国	北京	1805
1014	200174	Loi On In (吕安彦)	中国澳门	　	1805
1015	021106	Parshenok Andrey (帕申诺克·安德烈)	俄罗斯	科特拉斯	1805
1016	200112	Fong Chi Meng (冯梓鸣)	中国澳门	　	1803
1017	200045	Lei Sam Iao (李深宥)	中国澳门	　	1802
1018	200029	Lam Ian Cheng (林昕澄)	中国澳门	　	1802
1019	020964	Popova Maria (波波娃·玛丽亚)	俄罗斯	波久加	1801
1020	101919	Li Zijin (李紫瑾)	中国	湖南	1801
1021	200057	Chu Hio Chon (朱晓进)	中国澳门	　	1801
1022	200092	U Lek Wang (余力泓)	中国澳门	　	1801
1023	101644	Li Junyan (李俊彦)	中国	江苏	1800
1024	090249	Tanissaar Mattias (塔尼萨·马蒂亚斯)	爱沙尼亚	塔林	1800
1025	200055	Vong Chi Wun (黄梓桓)	中国澳门	　	1800
1026	021134	Kudrjavtsev Andrey (库德里亚夫采夫·安德烈)	俄罗斯	雅罗斯拉夫尔	1799
1027	200096	Sam I Hang (沈以恒)	中国澳门	　	1799
1028	101913	Hao Yuqing (郝雨卿)	中国	河南	1798
1029	101402	Liu Yancheng (刘晏诚)	中国	北京	1798
1030	101130	Gong Yixuan (宫依轩)	中国	河北	1796
1031	090266	Kütt Andreas-Gert (屈特·安德烈亚斯-格尔特)	爱沙尼亚	塔林	1796
1032	010232	Kamikubo Mineo (上久保峰夫)	日本	滨松	1794
1033	010418	Kasahara Reiko (笠原礼子)	日本	东京	1794
1034	020825	Shabanov Ivan (沙巴诺夫·伊万)	俄罗斯	波久加	1794
1035	021061	Lapin Maxim (拉宾·马克西姆)	俄罗斯	科诺沙	1793
1036	130158	Choi Chang Yeol	韩国	　	1793
1037	200103	Sze Meng Chon (施明竣)	中国澳门	　	1791
1038	101977	Li Kexin (李可心)	中国	江苏	1791
1039	101837	Zhu Dan (朱聃)	中国	江苏	1791
1040	101640	Zheng Yuxuan (郑宇轩)	中国	广东	1791
1041	101495	Zha Jintian (查瑾恬)	中国	江苏	1790
1042	110046	Hsieh Jung-Kuo (谢荣国)	中国台湾	台北	1790
1043	101840	Song Yumeng (宋雨萌)	中国	江苏	1789
1044	101915	Zhou Yebin (周烨彬)	中国	山西	1787
1045	200073	Vong Cheng Hong	中国澳门	　	1786
1046	200063	Leong Chi Mei (梁志美)	中国澳门	　	1785
1047	100905	Yin Caiying (殷彩英)	中国	北京	1784
1048	101639	Wu Xuyanqi (吴许砚琦)	中国	江苏	1784
1049	100343	Zhang Tieliang (张铁良)	中国	北京	1782
1050	090248	Välli Ida-Liisa (瓦利·艾达-丽莎)	爱沙尼亚	塔林	1782
1051	200053	Gee Mei San (朱美珊)	中国澳门	　	1781
1052	010445	Nakamura Keigo (中村圭吾)	日本	神奈川	1780
1053	101489	Hou Qixuan (侯琦萱)	中国	江苏	1780
1054	101917	Hao Zongxiang (郝宗祥)	中国	山东	1778
1055	101446	Zhu Ye (朱叶)	中国	江苏	1777
1056	021047	Eliseev Georgy (埃利谢耶夫·格奥尔基)	俄罗斯	下诺夫哥罗德	1777
1057	090276	Albo Iris Amelii	爱沙尼亚	　	1777
1058	200075	Kong Heng Chun (孔庆铨)	中国澳门	　	1777
1059	200172	Wong Ut Seng (黄悦诚)	中国澳门	　	1777
1060	021162	Gasanova Eva	俄罗斯	科特拉斯	1776
1061	110130	Chen Yu-Chih (陈昱至)	中国台湾	台北	1775
1062	090200	Mere Paul Johann (梅雷·保罗·约翰)	爱沙尼亚	塔林	1775
1063	101638	Cao Jiagen (曹家根)	中国	河北	1774
1064	090239	Normak Mihkel (诺马克·米克尔)	爱沙尼亚	塔林	1771
1065	110067	Chiang Teng-Hui (江灯辉)	中国台湾	台北	1768
1066	090218	Saard Sergo (萨尔德·塞尔戈)	爱沙尼亚	塔林	1767
1067	200058	Sze Weng Teng (施咏婷)	中国澳门	　	1766
1068	020935	Novichkova Viktoriia (诺维奇科娃·维多利亚)	俄罗斯	莫斯科	1766
1069	200202	Chan Lok Teng (陈洛婷)	中国澳门	　	1765
1070	101662	Wang Zimo (王紫默)	中国	河北	1764
1071	021121	Vitkov Maksim (维特科夫·马克西姆)	俄罗斯	科诺沙	1764
1072	200054	Chu Ngou Hei (朱翱曦)	中国澳门	　	1763
1073	200177	Ye Hon San (叶汉辰)	中国澳门	　	1763
1074	101921	Wang Yinhong (王胤弘)	中国	内蒙古	1763
1075	101982	Shen Ziyang (沈梓洋)	中国	江苏	1763
1076	200059	Chen Hok Kuan (陈鹤珺)	中国澳门	　	1762
1077	010381	Inazumi Masanori (稻住正则)	日本	福冈	1762
1078	010452	Suzuki Tetsuji (铃木哲尔)	日本	东京	1762
1079	090227	Lemmik Laas (莱米克·拉斯)	爱沙尼亚	塔林	1761
1080	101699	Wei Chengqian (魏承乾)	中国	江苏	1761
1081	101922	Tan Yige (谭以歌)	中国	江西	1761
1082	021179	Zarubin Denis	俄罗斯	雅罗斯拉夫尔	1760
1083	102103	Chen Yifan (陈一帆)	中国	浙江	1760
1084	102245	Xie Enqi (解恩齐)	中国	江苏	1760
1085	010193	Shibata Satoru (柴田悟)	日本	　	1760
1086	110198	Chen Wei-Chih (陳威至)	中国台湾	台北	1760
1087	102279	Chu Mingjun (楚明骏)	中国	四川	1759
1088	010353	Kato Miko (加藤未子)	日本	滨松	1759
1089	100894	Xu Ruiming (许瑞明)	中国	北京	1757
1090	021146	Ismailova Maryiam (伊斯马洛娃·玛丽亚姆)	俄罗斯	下诺夫哥罗德	1756
1091	090261	Meikop Karl Johann (梅科普·卡尔·约翰)	爱沙尼亚	塔尔图	1756
1092	021157	Evgrafova Arina	俄罗斯	阿尔汉格尔斯克	1756
1093	200098	Hoi Chi Hou (许子昊)	中国澳门	　	1755
1094	200108	Chao Cheng Hei (周正熹)	中国澳门	　	1754
1095	021077	Kolchurina Anastasia (科尔丘丽娜·阿纳斯塔西娅)	俄罗斯	下诺夫哥罗德	1753
1096	021229	Konyhov Andrej	俄罗斯	雷宾斯克	1753
1097	200151	Ho Yui Lam (何睿霖)	中国澳门	　	1753
1098	180029	Georgikakis Nikolaos (乔治卡基斯·尼古拉斯)	希腊	哈尼亚	1753
1099	021132	Pershivalov Ruslan (佩尔希瓦洛夫·鲁斯兰)	俄罗斯	雅罗斯拉夫尔	1753
1100	020811	Makhin Matvei (马欣·马特维)	俄罗斯	科特拉斯	1752
1101	200076	Mak Chon Fong (麦俊峰)	中国澳门	　	1752
1102	020768	Makhina Alla (玛希娜·阿拉)	俄罗斯	雅罗斯拉夫尔	1752
1103	200109	Ho In Hei (何彦希)	中国澳门	　	1752
1104	101924	Niu Yuxin (牛语昕)	中国	山西	1751
1105	021151	Strasnenkov Nikita	俄罗斯	波久加	1750
1106	021020	Geletyuk Konstantin (格列秋克·康斯坦丁)	俄罗斯	科特拉斯	1748
1107	101932	Wang Yuze (王雨泽)	中国	天津	1745
1108	200049	Ho Chon Hin (何峻骞)	中国澳门	　	1743
1109	101812	Chen Junhan (陈俊翰)	中国	广东	1743
1110	200219	Lei Chi Weng (李姿颖)	中国澳门	　	1742
1111	190008	Zencir Pelin (泽西尔·佩林)	土耳其	伊斯坦布尔	1741
1112	010271	Takamura Syouto (高村翔人)	日本	滨松	1741
1113	101649	Lin Jingsong (林敬淞)	中国	四川	1741
1114	090264	Tuul Ronan Thor (图尔·罗南·托尔)	爱沙尼亚	拉格里	1740
1115	021189	Ivanov Ivan	俄罗斯	科特拉斯	1740
1116	090242	Sander Oskar (桑德尔·奥斯卡)	爱沙尼亚	塔林	1738
1117	021152	Sobolev Maksim (索博列夫·马克西姆)	俄罗斯	雅罗斯拉夫尔	1737
1118	102101	Wang Ke (王轲)	中国	浙江	1737
1119	021046	Sprikut Albert (斯普里库特·阿尔伯特)	俄罗斯	莫斯科	1736
1120	090216	Lents Sebastian (伦茨·塞巴斯蒂安)	爱沙尼亚	塔林	1735
1121	020824	Piruakov Artem (佩鲁阿科夫·阿尔乔姆)	俄罗斯	波久加	1735
1122	020416	Gureyev Sergey (古列耶夫·谢尔盖)	俄罗斯	下诺夫哥罗德	1731
1123	200178	Ao Yik Hei (区奕晞)	中国澳门	　	1731
1124	200074	Chao Hou In (周灏贤)	中国澳门	　	1731
1125	110207	Lin Chen-Yi (林宸億)	中国台湾	台南	1730
1126	010430	Taniguchi Ren (谷口莲生)	日本	堺市	1729
1127	021147	Komrakova Veronika (科姆拉科娃·维罗妮卡)	俄罗斯	下诺夫哥罗德	1728
1128	020966	Maslova Daria (马斯洛娃·达里娅)	俄罗斯	雅罗斯拉夫尔	1728
1129	010314	Kawada Rikuto (川田陆翔)	日本	滨松	1726
1130	090213	Laanemets Emil (拉内梅茨·埃米尔)	爱沙尼亚	塔林	1726
1131	200101	Chio Pui Kei (赵沛淇)	中国澳门	　	1725
1132	200216	Chang Hoi Chon (曾愷晙)	中国澳门	　	1725
1133	090272	Kask Sören (卡斯克·瑟伦)	爱沙尼亚	塔林	1722
1134	150263	Mikeš Alois	捷克	Uherské Hradiště	1718
1135	021091	Bova Aleksandra (波娃·亚历山德拉)	俄罗斯	科诺沙	1717
1136	130200	Kim Chang Beom	韩国	庆尚南道	1716
1137	101716	Liu Xiaoyang (刘潇阳)	中国	辽宁	1715
1138	200061	Kuong Chi Hin (邝子轩)	中国澳门	　	1715
1139	101920	Zhao Yi'an (赵亦安)	中国	西藏	1715
1140	200122	Leong Cheok Hin	中国澳门	　	1713
1141	021101	Kulagin Artem (库拉金·阿尔乔姆)	俄罗斯	雅罗斯拉夫尔	1712
1142	200134	Lam Sio I (林筱宜)	中国澳门	　	1712
1143	021173	Vershinin Kirill	俄罗斯	沃洛格达	1712
1144	200129	Ip Sam Iao (叶心悠)	中国澳门	　	1710
1145	101709	Duan Jinglan (段景兰)	中国	黑龙江	1709
1146	200060	Sze Weng Lam (施咏琳)	中国澳门	　	1709
1147	021230	Kopeikin Egor	俄罗斯	雷宾斯克	1707
1148	021081	Kozhemjakin Kirill (科热米亚金·基里尔)	俄罗斯	科诺沙	1704
1149	101927	Luo Mengze (雒梦泽)	中国	河南	1704
1150	021084	Ozerova Marina (奥泽罗瓦·马林娜)	俄罗斯	科诺沙	1703
1151	021193	Kalandarov Gleb	俄罗斯	阿尔汉格尔斯克	1703
1152	021089	Zolotarev Artem (佐洛塔列夫·阿尔乔姆)	俄罗斯	科诺沙	1702
1153	101930	Zhang Youchen (张右辰)	中国	辽宁	1700
1154	021108	Belozerov Timofei (别洛泽罗夫·季莫菲)	俄罗斯	莫斯科	1700
1155	200125	Chan Pak Yin (陈柏言)	中国澳门	　	1700
1156	021231	Kopeikina Varvara	俄罗斯	雷宾斯克	1698
1157	090224	Karba Karoliina (卡巴·卡罗琳娜)	爱沙尼亚	塔尔图	1696
1158	021192	Izhmyakova Amalia	俄罗斯	阿尔汉格尔斯克	1696
1159	020814	Ogneva Julia (奥涅娃·尤利娅)	俄罗斯	下诺夫哥罗德	1695
1160	021165	Martynov Dmitry	俄罗斯	科诺沙	1695
1161	090252	Kond Jesper (孔德·耶斯佩尔)	爱沙尼亚	塔林	1694
1162	200180	Leong Keng Hou (梁境皓)	中国澳门	　	1693
1163	200126	Wu Iat Cheng (胡溢晴)	中国澳门	　	1693
1164	021000	Nikitin Alexandr (尼基丁·亚历山大)	俄罗斯	雷宾斯克	1691
1165	200131	Chan Seong I (陈上懿)	中国澳门	　	1690
1166	101929	Nie Yuchen (聂宇辰)	中国	山西	1690
1167	101678	Li Zexu (李泽勖)	中国	江苏	1686
1168	021154	Vostryakov Denis (沃斯特里亚科夫·丹尼斯)	俄罗斯	阿尔汉格尔斯克	1683
1169	200138	Wong Chi Nok (王梓诺)	中国澳门	　	1681
1170	021172	Kulkov Viktor	俄罗斯	雅罗斯拉夫尔	1675
1171	021062	Petrovich Vadim (彼得罗维奇·瓦迪姆)	俄罗斯	波久加	1674
1172	021033	Roshtshina Dilyara (罗什希娜·迪利亚拉)	俄罗斯	莫斯科	1673
1173	200188	Chan I Kio (陈旖荞)	中国澳门	　	1673
1174	101926	He Yanliang (何颜良)	中国	西藏	1671
1175	101925	Chen Xinglin (陈星霖)	中国	内蒙古	1671
1176	101861	Wang Junxi (汪俊羲)	中国	江苏	1669
1177	020968	Gerasimovskaja Nina (格拉西莫夫斯卡娅·尼娜)	俄罗斯	雅罗斯拉夫尔	1667
1178	200192	Zhong Chi Hou (钟智濠)	中国澳门	　	1665
1179	030141	Karlsson Sander (卡尔森·桑德尔)	瑞典	斯德哥尔摩	1665
1180	021095	Birichevskaya Darina (比里切夫斯卡娅·达丽娜)	俄罗斯	科诺沙	1663
1181	101931	Xu Dengke (许登科)	中国	山西	1662
1182	090260	Kaljurand Karl Lukas (卡柳兰德·卡尔·卢卡斯)	爱沙尼亚	塔林	1662
1183	050045	Aleksandrenkova Maria	拉脱维亚	奥莱内	1658
1184	021247	Lebedeva Maria	俄罗斯	莫斯科	1656
1185	021197	Goncharova Taicia	俄罗斯	阿尔汉格尔斯克	1656
1186	021082	Minkina Yuliya (明基娜·尤利娅)	俄罗斯	科特拉斯	1652
1187	021159	Kozenkova Angelina (科津科娃·安吉丽娜)	俄罗斯	科诺沙	1651
1188	021176	Korovin Gleb	俄罗斯	科特拉斯	1650
1189	101696	Kang Ning (康宁)	中国	江苏	1650
1190	101933	Li Chengfeng (李承峰)	中国	山东	1649
1191	080085	Karamyan Marietta	亚美尼亚	埃里温	1646
1192	180035	Kostopoulos Harris	希腊	　	1646
1193	200064	Lee Chi Io (李子尧)	中国澳门	　	1644
1194	090197	Kõllo Liisa Maria (科洛·丽莎·玛丽亚)	爱沙尼亚	塔林	1644
1195	021156	Pereshivalov Ruslan	俄罗斯	雅罗斯拉夫尔	1644
1196	180028	Aligizaki Angelika (阿里扎基·安吉利基)	希腊	哈尼亚	1643
1197	021246	Kulkov Vladimir	俄罗斯	雅罗斯拉夫尔	1642
1198	090282	Meritee Tanno	爱沙尼亚	塔林	1642
1199	200136	Leong In Jasper	中国澳门	　	1641
1200	021102	Apanasenko Aleksey (阿帕纳先科·阿列克谢)	俄罗斯	　	1641
1201	021163	Teremova Anastasia	俄罗斯	科特拉斯	1640
1202	021155	Perminov Fedor	俄罗斯	下诺夫哥罗德	1639
1203	021195	Zvereva Aleksandra	俄罗斯	阿尔汉格尔斯克	1637
1204	021138	Novozhilova Alexandra (诺沃日洛娃·亚力山德拉)	俄罗斯	雅罗斯拉夫尔	1636
1205	200221	Da Luz Gael Lourenco (李成熙)	中国澳门	　	1635
1206	021122	Kholopov Ilya (霍洛波夫·伊利亚)	俄罗斯	科诺沙	1634
1207	101980	Que Weiqi (阙炜祺)	中国	江苏	1632
1208	090219	Kala Hans Krister (卡拉·汉斯·克里斯特)	爱沙尼亚	塔林	1628
1209	200078	Chao Hou Lai (周灏澧)	中国澳门	　	1627
1210	130229	Kim Do Yoon	韩国	　	1626
1211	101496	Min Chen (闵晨)	中国	江苏	1626
1212	010326	Kurata Daichi (仓田大地)	日本	滨松	1625
1213	101934	Li Yilun (李奕伦)	中国	山西	1625
1214	200133	Leong Seong Kei (梁尚麒)	中国澳门	　	1623
1215	200077	Chan Ian Kei (陈恩祈)	中国澳门	　	1621
1216	010374	Ito Tsunehisa (伊藤恒久)	日本	滨松	1620
1217	110140	Kuo Heng-Li (郭恒立)	中国台湾	台北	1620
1218	021136	Vlaskin Georgy	俄罗斯	雅罗斯拉夫尔	1618
1219	090285	Puust Tõnis	爱沙尼亚	塔林	1617
1220	021090	Afanasiev Maksim (阿法纳西耶夫·马克西姆)	俄罗斯	科诺沙	1610
1221	020967	Sharov Luka (沙罗夫·卢卡)	俄罗斯	莫斯科	1607
1222	021196	Ivanova Yulia	俄罗斯	阿尔汉格尔斯克	1607
1223	021194	Bragina Anna	俄罗斯	阿尔汉格尔斯克	1607
1224	110105	Li Tzu-Min (李祖明)	中国台湾	台北	1606
1225	200062	Chin Keng Tin (钱经天)	中国澳门	　	1606
1226	021186	Denisov Nikolai	俄罗斯	　	1606
1227	021198	Kanashev Daniil	俄罗斯	阿尔汉格尔斯克	1605
1228	090277	Pärnamaa Artur	爱沙尼亚	　	1604
1229	021160	Churkina Elizaveta	俄罗斯	阿尔汉格尔斯克	1601
1230	090284	Arnik Martin	爱沙尼亚	塔林	1599
1231	010393	Adachi Tomoya	日本	堺市	1598
1232	021104	Kulemin Anatoly (库莱明·阿纳托利)	俄罗斯	雅罗斯拉夫尔	1598
1233	021187	Vitrichenko Artem	俄罗斯	　	1597
1234	021148	Golubev Kirill	俄罗斯	雅罗斯拉夫尔	1594
1235	200153	Lao Ngai In Adrian (刘羿弦)	中国澳门	　	1592
1236	021085	Nogovitsin Artem (诺戈维钦·阿尔乔姆)	俄罗斯	波久加	1590
1237	101979	Lang Jinyu (郎瑾瑜)	中国	江苏	1586
1238	021164	Ivanova Lilia	俄罗斯	阿尔汉格尔斯克	1585
1239	101935	Tan Xin (谭芯)	中国	西藏	1585
1240	080083	Danielyan Razmik	亚美尼亚	埃里温	1584
1241	200143	Un Chi Fong (袁梓峰)	中国澳门	　	1583
1242	200224	Sam Ka Ioi (沈伽睿)	中国澳门	　	1582
1243	010304	Koseki Kenshou (古迹健将)	日本	青森	1578
1244	200139	Cheong Sin Iao (张善柔)	中国澳门	　	1576
1245	101864	Chang Minghao (常名昊)	中国	江苏	1575
1246	090275	Sarv Mathias	爱沙尼亚	塔林	1574
1247	200201	Ng Ka Kei (吴家琪)	中国澳门	　	1574
1248	021238	Erin Oleg	俄罗斯	科诺沙	1573
1249	200144	Wu Iat Long (胡溢朗)	中国澳门	　	1571
1250	090274	Aarna Jakob	爱沙尼亚	塔林	1570
1251	090269	Maranik Mark-Erik (马拉尼克·马克-埃里克)	爱沙尼亚	塔林	1566
1252	021088	Garmanov Radion (加马诺夫·拉迪翁)	俄罗斯	科诺沙	1564
1253	021107	Zateev Oleg	俄罗斯	雷宾斯克	1563
1254	200119	Chio Hei Tong (赵晞彤)	中国澳门	　	1562
1255	021144	Anokhin Mikhail (阿诺欣·米哈伊尔)	俄罗斯	下诺夫哥罗德	1561
1256	200158	Lei Ian Sin (李甄善)	中国澳门	　	1554
1257	021124	Ananyev Danila (阿纳涅夫·丹尼拉)	俄罗斯	科诺沙	1553
1258	021125	Kapustinskaia Ruslana (卡普斯京斯卡娅·鲁斯兰娜)	俄罗斯	科诺沙	1551
1259	021092	Pakholkov Stepan (帕霍尔科夫·斯捷潘)	俄罗斯	科特拉斯	1551
1260	090257	Pukk Laura (普克·劳拉)	爱沙尼亚	塔林	1551
1261	102295	Yi Yuyang (易裕洋)	中国	湖南	1550
1262	021174	Ovcharenko Valeria	俄罗斯	科诺沙	1548
1263	200140	U Io Wa David (余耀华)	中国澳门	　	1545
1264	021115	Sokolov Artem (索科洛夫·阿尔乔姆)	俄罗斯	波久加	1542
1265	021137	Sokolnikov Alexey	俄罗斯	雅罗斯拉夫尔	1542
1266	010439	Hayata Shinnosuke (早田慎之介)	日本	福冈	1541
1267	021093	Lobachev Kirill (罗巴乔夫·基里尔)	俄罗斯	科诺沙	1539
1268	021166	Teremov Artem	俄罗斯	科特拉斯	1537
1269	021067	Zhukova Kseniia (茹科娃·克谢尼娅)	俄罗斯	波久加	1534
1270	021094	Minkina Elena (明金娜·叶莲娜)	俄罗斯	科特拉斯	1530
1271	101668	Lin Shiqi (林诗棋)	中国	广东	1528
1272	021128	Buyanov Konstantin (布亚诺夫·康斯坦丁)	俄罗斯	波久加	1528
1273	101694	Deng Bojun (邓博骏)	中国	江苏	1527
1274	180031	Voutsadakis Nikolai (武萨达基斯·尼古拉)	希腊	哈尼亚	1527
1275	180030	Kamvisiou Nikoletta (坎比修·尼科莱塔)	希腊	哈尼亚	1520
1276	021168	Gasanova Ayla	俄罗斯	科特拉斯	1508
1277	021149	Gerasimovskaia Aleksandra	俄罗斯	雅罗斯拉夫尔	1503
1278	101936	Sun Shixuan (孙世轩)	中国	山东	1500
1279	021117	Sokolova Veronika (索科洛娃·韦罗妮卡)	俄罗斯	波久加	1492
1280	021240	Moskvina Polina	俄罗斯	科诺沙	1491
1281	021236	Kokachev Arseniy	俄罗斯	科诺沙	1484
1282	021265	Alexander Talkovsky	俄罗斯	　	1481
1283	021239	Shabanov Ilya	俄罗斯	波久加	1476
1284	010323	Kurakake Mataichi (仓挂又一)	日本	福冈	1476
1285	021142	Popovich Anastasia (波波维奇·阿纳斯塔西娅)	俄罗斯	科特拉斯	1467
1286	021127	Sokolov Roald (索科洛夫·罗尔德)	俄罗斯	波久加	1462
1287	010362	Kato Hoko (加藤穗子)	日本	滨松	1458
1288	020982	Bykova Ylia (贝科娃·尤莉娅)	俄罗斯	波久加	1453
1289	180032	Nikoletu Anastasia (尼科莱托·阿纳斯塔西娅)	希腊	哈尼亚	1450
1290	021182	Teremov Aleksandr	俄罗斯	雅罗斯拉夫尔	1432
1291	021175	Vershinina Valeria	俄罗斯	科诺沙	1432
1292	021206	Stepanov Ivan	俄罗斯	波久加	1424
1293	200154	Wong Chon Hou (王俊浩)	中国澳门	　	1417
1294	021263	Ivanova Alisa	俄罗斯	雷宾斯克	1417
1295	021036	Mityagin Maxim (米佳金·马克西姆)	俄罗斯	雷宾斯克	1414
1296	021001	Kazanin Artyom (卡赞宁·阿尔乔姆)	俄罗斯	雷宾斯克	1413
1297	090226	Karba Kertu (卡尔巴·克图)	爱沙尼亚	塔尔图	1404
1298	101937	Sun Liangyu (孙量宇)	中国	山东	1398
1299	021204	Elezova Arina	俄罗斯	科特拉斯	1382
1300	021242	Sedunov Artem	俄罗斯	科诺沙	1347
1301	021129	Chistyakova Margarita (奇斯佳科娃·玛加丽塔)	俄罗斯	科诺沙	1336
1302	021169	Dyakov Maksim	俄罗斯	阿尔汉格尔斯克	1310
1303	021105	Kraev Konstantin (克拉耶夫·康斯坦丁)	俄罗斯	波久加	1298
1304	021170	Zorin Egor	俄罗斯	科特拉斯	1295
1305	021188	Kazantseva Milana	俄罗斯	　	1294
1306	021190	Serebryannikov Artem	俄罗斯	波久加	1290
1307	021237	Gavryshkiv Ilya	俄罗斯	科诺沙	1184
`;

// 解析 txt 数据为棋手数组
const players = rawData.trim().split('\n').map(line => {
    const [rank, id, nameWithChinese, country, city, rating] = line.trim().split('\t');
    const chineseNameMatch = nameWithChinese.match(/\((.+)\)/);
    const name = chineseNameMatch ? chineseNameMatch[1] : null;
    let region;
    if (['中国香港', '中国澳门', '中国台湾'].includes(country)) {
        region = country;
    } else {
        region = city && city !== '　' ? `${country}${city}` : '';
    }
    return { name, region, rating: parseInt(rating) };
}).filter(player =>
    player.name &&
    player.region &&
    !isNaN(player.rating) &&
    (player.region.startsWith('中国') || player.region.startsWith('中国香港') || 
     player.region.startsWith('中国澳门') || player.region.startsWith('中国台湾'))
);

// 最大名字长度
const MAX_NAME_LENGTH = 4;

// 当前目标棋手
let targetPlayer = null;

// 猜测历史
let guessHistory = [];

// 难度级别和过滤后的棋手数组
let difficulty = 0; // 默认困难模式（0:简单, 1:中等, 2:困难）
let filteredPlayers = players;

// 根据难度过滤棋手
function filterPlayersByDifficulty(difficultyLevel) {
    if (difficultyLevel === 0) { // 简单模式：等级分 >= 2250
        return players.filter(player => player.rating >= 2250);
    } else if (difficultyLevel === 1) { // 中等模式：等级分 >= 2000
        return players.filter(player => player.rating >= 2000);
    } else { // 困难模式：所有棋手
        return players;
    }
}

// 更新棋手数量显示
function updatePlayerCount() {
    const playerCount = filteredPlayers.length;
    document.getElementById("player-count").textContent = playerCount;
}

// 游戏初始化
function startGame() {
    filteredPlayers = filterPlayersByDifficulty(difficulty);
    targetPlayer = filteredPlayers[Math.floor(Math.random() * filteredPlayers.length)];
    guessHistory = [];
    document.getElementById("name-input").value = "";
    document.getElementById("candidate-list").innerHTML = "";
    document.getElementById("guess-history").innerHTML = "";
    document.getElementById("answer").classList.add("hidden");
    document.getElementById("restart-btn").classList.add("hidden");
    document.getElementById("name-input").disabled = false;
    updatePlayerCount();
}

// 动态显示候选棋手
document.getElementById("name-input").addEventListener("input", (e) => {
    const query = e.target.value.trim();
    const candidateList = document.getElementById("candidate-list");
    candidateList.innerHTML = "";

    if (query === "") return;

    const candidates = filteredPlayers.filter(player => player.name.includes(query));
    candidates.forEach(player => {
        const candidateItem = document.createElement("div");
        candidateItem.classList.add("candidate-item");
        candidateItem.innerHTML = `${player.name}（${player.region}，等级分：${player.rating}）`;
        candidateItem.addEventListener("click", () => {
            checkGuess(player);
        });
        candidateList.appendChild(candidateItem);
    });
});

// 解析拼音，第一个字启用姓氏模式
function parsePinyin(char, isFirstChar = false) {
    if (isFirstChar) {
        return {
            initial: pinyinPro.pinyin(char, { pattern: 'initial', surname: 'head' }) || '',
            final: pinyinPro.pinyin(char, { pattern: 'final', toneType: 'none', surname: 'head' }) || '',
            tone: pinyinPro.pinyin(char, { pattern: 'num', surname: 'head' }) || ''
        };
    } else {
        return {
            initial: pinyinPro.pinyin(char, { pattern: 'initial' }) || '',
            final: pinyinPro.pinyin(char, { pattern: 'final', toneType: 'none' }) || '',
            tone: pinyinPro.pinyin(char, { pattern: 'num' }) || ''
        };
    }
}

// Wordle 判断函数
function wordleCompare(targetArray, guessArray) {
    const result = Array(MAX_NAME_LENGTH).fill('absent');
    const usedIndices = new Set();

    // 首先检查完全正确的位置（绿色）
    for (let i = 0; i < MAX_NAME_LENGTH; i++) {
        if (guessArray[i] === targetArray[i] && guessArray[i] !== '') {
            result[i] = 'correct';
            usedIndices.add(i);
        }
    }

    // 再检查部分匹配（橙色）
    for (let i = 0; i < MAX_NAME_LENGTH; i++) {
        if (result[i] === 'correct') continue;

        for (let j = 0; j < MAX_NAME_LENGTH; j++) {
            if (usedIndices.has(j)) continue;
            if (guessArray[i] === targetArray[j] && guessArray[i] !== '') {
                result[i] = 'present';
                usedIndices.add(j);
                break;
            }
        }
    }

    return result;
}

// 检查玩家的猜测
function checkGuess(selectedPlayer) {
    // 检查地区
    const regionClass = selectedPlayer.region === targetPlayer.region ? 'correct' : 'absent';
    const regionDisplay = `<span class="${regionClass}">${selectedPlayer.region}</span>`;

    // 检查等级分
    let ratingDisplay;
    if (selectedPlayer.rating === targetPlayer.rating) {
        ratingDisplay = `<span class="correct">${selectedPlayer.rating}</span>`;
    } else if (selectedPlayer.rating > targetPlayer.rating) {
        ratingDisplay = `${selectedPlayer.rating} ↓`;
    } else {
        ratingDisplay = `${selectedPlayer.rating} ↑`;
    }

    // 准备名字的四次 Wordle 判断
    const targetName = (targetPlayer.name + " ".repeat(MAX_NAME_LENGTH - targetPlayer.name.length)).split("");
    const guessName = (selectedPlayer.name + " ".repeat(MAX_NAME_LENGTH - selectedPlayer.name.length)).split("");

    // 汉字判断
    const charResult = wordleCompare(targetName, guessName);

    // 声母、韵母、声调判断，第一个字使用姓氏模式
    const targetPinyin = targetName.map((char, index) => parsePinyin(char, index === 0));
    const guessPinyin = guessName.map((char, index) => parsePinyin(char, index === 0));

    const initialResult = wordleCompare(targetPinyin.map(p => p.initial), guessPinyin.map(p => p.initial));
    const finalResult = wordleCompare(targetPinyin.map(p => p.final), guessPinyin.map(p => p.final));
    const toneResult = wordleCompare(targetPinyin.map(p => p.tone), guessPinyin.map(p => p.tone));

    // 存储猜测结果
    guessHistory.push({
        player: selectedPlayer,
        regionDisplay,
        ratingDisplay,
        guessName,
        guessPinyin,
        charResult,
        initialResult,
        finalResult,
        toneResult
    });

    // 显示猜测历史
    const guessHistoryDiv = document.getElementById("guess-history");
    guessHistoryDiv.innerHTML = '';

    guessHistory.reverse().forEach((guess, index) => {
        const guessRow = document.createElement("div");
        guessRow.classList.add("guess-row");

        const guessInfo = document.createElement("div");
        guessInfo.classList.add("guess-info");
        guessInfo.innerHTML = `
            <p>名字：${guess.player.name}</p>
            <p>地区：${guess.regionDisplay}</p>
            <p>等级分：${guess.ratingDisplay}</p>
        `;
        guessRow.appendChild(guessInfo);

        const nameAnalysis = document.createElement("div");
        nameAnalysis.classList.add("name-analysis");

        // 汉字行
        const charRow = document.createElement("div");
        charRow.classList.add("name-row");
        guess.guessName.forEach((char, i) => {
            const box = document.createElement("div");
            box.classList.add("name-box", guess.charResult[i]);
            box.textContent = char;
            charRow.appendChild(box);
        });
        nameAnalysis.appendChild(charRow);

        // 声母行
        const initialRow = document.createElement("div");
        initialRow.classList.add("name-row");
        guess.guessPinyin.forEach((p, i) => {
            const box = document.createElement("div");
            box.classList.add("name-box", guess.initialResult[i]);
            box.textContent = p.initial || '-';
            initialRow.appendChild(box);
        });
        nameAnalysis.appendChild(initialRow);

        // 韵母行
        const finalRow = document.createElement("div");
        finalRow.classList.add("name-row");
        guess.guessPinyin.forEach((p, i) => {
            const box = document.createElement("div");
            box.classList.add("name-box", guess.finalResult[i]);
            box.textContent = p.final || '-';
            finalRow.appendChild(box);
        });
        nameAnalysis.appendChild(finalRow);

        // 声调行
        const toneRow = document.createElement("div");
        toneRow.classList.add("name-row");
        guess.guessPinyin.forEach((p, i) => {
            const box = document.createElement("div");
            box.classList.add("name-box", guess.toneResult[i]);
            box.textContent = p.tone || '-';
            toneRow.appendChild(box);
        });
        nameAnalysis.appendChild(toneRow);

        guessRow.appendChild(nameAnalysis);
        guessHistoryDiv.appendChild(guessRow);
    });

    // 如果猜对了，显示答案并结束游戏
    if (selectedPlayer.name === targetPlayer.name) {
        const answerDiv = document.getElementById("answer");
        answerDiv.classList.remove("hidden");
        document.getElementById("answer-name").textContent = targetPlayer.name;
        document.getElementById("answer-region").textContent = targetPlayer.region;
        document.getElementById("answer-rating").textContent = targetPlayer.rating;
        document.getElementById("restart-btn").classList.remove("hidden");
        document.getElementById("name-input").disabled = true;
    }
}

// 重新开始游戏
document.getElementById("restart-btn").addEventListener("click", () => {
    document.getElementById("name-input").disabled = false;
    startGame();
});

// 教程弹窗逻辑
const tutorialBtn = document.getElementById("tutorial-btn");
const tutorialModal = document.getElementById("tutorial-modal");
const closeTutorial = document.getElementById("close-tutorial");

tutorialBtn.addEventListener("click", () => {
    tutorialModal.classList.remove("hidden");
});

closeTutorial.addEventListener("click", () => {
    tutorialModal.classList.add("hidden");
});

// 点击弹窗外部关闭
window.addEventListener("click", (event) => {
    if (event.target === tutorialModal) {
        tutorialModal.classList.add("hidden");
    }
});

// 添加滑杆事件监听器
document.getElementById("difficulty-slider").addEventListener("input", (e) => {
    difficulty = parseInt(e.target.value);
    startGame();
});

// 游戏初始化
filteredPlayers = filterPlayersByDifficulty(difficulty);
startGame();
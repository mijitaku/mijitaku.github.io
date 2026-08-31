月刊「身仕度」 GitHub Pages 公開一式

このフォルダの中身を GitHub のリポジトリ直下に置き、GitHub Pages を main / root で公開すれば動作します。

【ページ構成】
index.html                 トップページ
about/                     身仕度について
backnumber/                バックナンバー
members/                   メンバー
feedback/                  感想フォーム
viewer/                    ページめくりビューア
site-data.js               号・メンバー・リンクの管理情報
assets/                     ロゴ・アイコン・CSS

【通常の新号追加】
1. 完成PDFを各ページ画像 p-01.jpg, p-02.jpg... に変換して viewer/issues/新号フォルダ/ に入れる。
2. site-data.js の issues の先頭に新号を追加し latest:true を付ける。
3. それまでの最新号の latest:true を削除する。
4. GitHub に反映する。

トップの最新号表紙・「最新号を読む」、Back Number、ビューアの号選択は site-data.js をもとに自動反映します。

【通常触らないもの】
viewer/index.html はページめくり本体です。ペロン動作の調整時以外は触らないでください。

【現在収録】
創刊号、12月号、1月号、2月号、3月号、4月号、5月号、6月号、7月号、8月号（最新号）

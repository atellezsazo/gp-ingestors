'use strict';

const libingester = require('libingester');
// const thenifyAll = require('thenify-all');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'http://bongdaplus.vn/';
const RSS_FEED = [
    'http://bongdaplus.vn/rss/trang-chu.rss', // home
    'http://bongdaplus.vn/rss/viet-nam/2.rss', // vietnam
    'http://bongdaplus.vn/rss/anh/13.rss', // english
    'http://bongdaplus.vn/rss/tay-ban-nha/18.rss', // Spain
    'http://bongdaplus.vn/rss/duc/24.rss', //
    'http://bongdaplus.vn/rss/italia/21.rss', // Italy
    'http://bongdaplus.vn/rss/phap/27.rss', // France
    'http://bongdaplus.vn/rss/champions-league/131.rss', // Uefa champions league
    'http://bongdaplus.vn/rss/u20-world-cup/144.rss', // star
    'http://bongdaplus.vn/rss/the-gioi/30.rss', // world
    'http://bongdaplus.vn/rss/the-thao/62.rss', // sport
    'http://bongdaplus.vn/rss/dam-me/63.rss', //
    'http://bongdaplus.vn/rss/chuyen-nhuong/58.rss', // transfer
    'http://bongdaplus.vn/rss/europa-league/132.rss', // europa league
    'http://bongdaplus.vn/rss/biem-hoa/137.rss', // carton
];

// max links per category
const MAX_LINKS = 5;

// cleaning elements
const CLEAN_ELEMENTS = [
    'a',
    'div',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'table',
    'td',
    'tr',
    'ul',
];

// delete attr (tag)
const REMOVE_ATTR = [
    'align',
    'class',
    'data-field',
    'data-original',
    'dir',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    'br',
    'iframe',
    'noscript',
    'script',
    'style',
    '.fbshr',
    '.cl10',
    '.thumbox',
];

const CUSTOM_SCSS = `
$primary-light-color: #E31314;
$primary-medium-color: #222222;
$primary-dark-color: #555555;
$accent-light-color: #FF0002;
$accent-dark-color: #DE0E10;
$background-light-color: #EEEEEE;
$background-dark-color: #E8E8E8;

$title-font: 'Arimo';
$body-font: 'Merriweather';
$display-font: 'Arimo';
$logo-font: 'Fira Sans';
$context-font: 'Arimo';
$support-font: 'Arimo';

@import "_default";
`;

// delete duplicated elements in array
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/**   ingest_article()
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const author = $('.auth b').text();
        const category = $('.breakcrum').first().clone();
        const copyright = $('.copybar b font').text();
        const synopsis = $('meta[property="og:description"]').attr('content');
        const modified_date = $('meta[itemprop="dateModified"]').attr('content') // for asset
        const modified_time = modified_date.replace(' ', 'T').replace(/\s/g, '');
        const published = new Date(Date.parse(modified_time));
        const read_more = 'Xem thêm tại www.bongdaplus.vn';
        const tags = $('.taglst a').map((i,elem) => $(elem).text()).get();
        const section = $('meta[name="keywords"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content').replace(' - Bongdaplus.vn','');
        const thumb_div = $('.thumbox').first();
        const thumb_src = thumb_div.find('img').attr('src');
        const thumb_caption = $('.summ').first()[0];
        let body = $('.content').first().attr('id','mybody');

        if (body.find('table').first()[0]) console.log(uri);


        const download_thumins = () => {
            body.find('.thumins').map((i,elem) => {
                const img = $(elem).find('img').first();
                const caption = $(elem).find('.thumcap').text();
                if (img[0]) {
                    const figure = $('<figure></figure>').append(img.clone());
                    if (caption) figure.append($(`<figcaption><p>${caption}</p></figcaption>`));
                    $(elem).replaceWith(figure);
                }
            });
        }
        // fixed algunos body's
        // console.log(body[0].attribs);
        // const live_stream = body.find('#LiveStreamr').first();
        // if (live_stream)
        // if (live_stream[0]) {
        //     console.log('replace');
        //     live_stream.find('.livmsg').insertAfter(live_stream);
        //     live_stream.remove();
        // }
        if ($('.livstrm').first()[0]) { return;
            // body = $('.livstrm').first();
            // body.find('.livmsg').map((i,elem) => {
            //     const tag = $(elem).find('.livcont').first()[0];
            //     if (tag) {
            //         const span = $(elem).find('span').first()[0];
            //         if (span) $(span).replaceWith($(`<p><strong>${$(span).text()}</strong><p>`));
            //         $(elem).find('div').map((i,elem) => elem.name = 'p');
            //         const period = $(elem).find('.period').first()[0];
            //         if (period) $(period).insertAfter($(period).parent());
            //         const thumins = $(elem).find('.thumins').first()[0];
            //         if (thumins) $(thumins).parent().replaceWith(thumins);
            //         $(elem).replaceWith($(tag));
            //         download_thumins();
            //         return;
            //     }
            // });
        }

        // console.log(body.html());

        // fixed images on div's
        download_thumins();

        // convert div's in paragraphs
        body.contents().map((i,elem) => {
            const attr = elem.attribs || {class: ''};
            if (elem.name == 'div' && !attr.class.includes('livmsg')) elem.name = 'p'
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));
        body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));

        // download main image
        let thumb;
        if (thumb_src) {
            const image = libingester.util.download_image(thumb_src);
            image.set_title(title);
            hatch.save_asset(image);
            asset.set_main_image(thumb = image);
            asset.set_thumbnail(thumb);
            thumb_div.remove();
            if (thumb_caption) {
                $(thumb_caption).find('div').remove();
                asset.set_main_image_caption($(thumb_caption).text());
            }
        }

        // download images
        body.find('img').map((i,elem) => {
            const src = elem.attribs.src;
            let parent = $(elem).parent();
            let image;
            if (parent[0].name == 'figure') {
                parent = parent.parent();
                if (parent[0].name == 'p') {
                    $(elem).parent().insertAfter(parent);
                }
                image = libingester.util.download_img(body.find(`img[src="${src}"]`).first());
            } else {
                const figure = $('<figure></figure>').append($(elem).clone());
                image = libingester.util.download_img(figure.children());
                $(elem).replaceWith(figure);
            }
            image.set_title(title);
            hatch.save_asset(image);
            if (!thumb) asset.set_thumbnail(thumb = image);
        });

        // embed tags
        body.find('.embedbox').map((i,elem) => {
            const parent = $(elem).parent()[0] || {};
            const text = $('.embcapt').first().text();
            const src = $('.embitem iframe').first().attr('src');
            if (src && text && parent.name == 'p') {
                $(`<p><strong>${text}</strong></p>`).insertBefore(parent);
                const video = libingester.util.get_embedded_video_asset($(elem), src);
            } else {
                $(elem).remove();
            }
        });

        //
        body.find('p table').map((i,elem) => {
            if ($(elem).parent()[0].name == 'p') $(elem).insertAfter($(elem).parent());
        });

        // console.log(body.html());
        // clean empty tags
        body.find('div').map((i,elem) => {

        });
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // article settings
        console.log('processing',title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_SCSS);
        asset.set_last_modified_date(published);
        asset.set_date_published(published);
        asset.set_license(copyright);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(synopsis);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        console.log(err);
    });
}

function _load_rss(rss_uri) {
    return new Promise((resolve, reject) => {
        rss2json.load(rss_uri, (err, rss) => {
            if (err) reject(err);
            else resolve(rss.items.slice(0,MAX_LINKS));
        });
    });
}

function _load_all_rss_links(rss_list) {
    let all_links = [];
    return Promise.all(rss_list.map(rss => _load_rss(rss).then(items => {
        items.map(item => all_links.push(item.link));
    }))).then(() => all_links.unique());
}

function main() {
    const hatch = new libingester.Hatch('bongdaplus-vn', 'vi');

    // _load_all_rss_links(RSS_FEED).then(links =>
    //     Promise.all(links.map(link => ingest_article(hatch, link)))
    //         .then(() => hatch.finish())
    // ).catch(err => {
    //     console.log(err);
    //     process.exitCode = 1;
    // });

    const uris = [
        // 'http://bongdaplus.vn/tin-tuc/biem-hoa/anh-che-thi-cu-qua-lang-kinh-bong-da-1901351706.html',
        // 'http://bongdaplus.vn/tin-tuc/the-thao/tennis/kvitova-rut-khoi-giai-o-eastbourne-1904551706.html',
        // 'http://bongdaplus.vn/tin-tuc/phap/ligue-1/tuong-lai-cua-ben-arfa-tai-psg-di-khong-duoc-o-khong-xong-1905951706.html',
        'http://bongdaplus.vn/tin-tuc/diem-tin/tin-nong-toi-29-6-van-persie-tren-duong-tro-lai-giai-ngoai-hang-anh-1906651706.html',
        // 'http://bongdaplus.vn/tin-tuc/the-thao/tennis/big-four-du-mat-trong-top-4-hat-giong-o-wimbledon-1906161706.html',
    ];

    Promise.all(uris.map(uri => ingest_article(hatch, uri)))
        .then(() => hatch.finish());
}

main();

'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'http://vtv.vn/';
const max_links = 10; // max links per 'rss'
const rss_feed = [
    'http://vtv.vn/trong-nuoc.rss', // Country News
    'http://vtv.vn/the-gioi.rss', // World News
    'http://vtv.vn/the-thao.rss', // sports
    'http://vtv.vn/kinh-te.rss', // economy
    'http://vtv.vn/truyen-hinh.rss', // television
    'http://vtv.vn/van-hoa-giai-tri.rss', // entertainment
    'http://vtv.vn/suc-khoe.rss', //Health
    'http://vtv.vn/giao-duc.rss', // education
    'http://vtv.vn/cong-nghe.rss', // tecnology
    'http://vtv.vn/goc-doanh-nghiep.rss' //Enterpreunshi
];

// cleaning elements
const CLEAM_ELEMENTS = [
    'a',
    'div',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'ul'
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'data-field',
    'data-original',
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
    'width'
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.ads-sponsor',
    '.author',
    '.adv-bottom',
    '.clear',
    '.clearfix',
    '.icon_box',
    '.gachxanh',
    '.news-avatar',
    '.news-info',
    '.news_keyword',
    '.RelatedNews',
    '.slwrap',
    '.tag',
    '.tlq',
    '.title_detail',
    '.w824',
    '.tinmoi_st',
    '.VCObjectBoxRelatedNewsContentWrapper',
    'h1',
    'div[type="RelatedOneNews"]',
    'div[type="VideoStream"]',
    'iframe',
    'noscript',
    'script',
    'style'
];

const CUSTOM_CSS = `
$primary-light-color: #E31314;
$primary-medium-color: #2C2C2C;
$primary-dark-color: #B70202;
$accent-light-color: #007BB8;
$accent-dark-color: #006A9F;
$background-light-color: #F5F6F7;
$background-dark-color: #EFF1F2;
$title-font: 'Arial';
$body-font: 'Noto serif';
$display-font: 'Oswald';
$context-font: 'Roboto Condensed';
$support-font: 'Arial';

@import '_default';
`;

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('p.author').text().split('-')[0] || $('.news-info b').text();
        const body = $('div.ta-justify, .infomationdetail').first().attr('id','mybody');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="article:modified_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Vtv';
        const read_more = `Bài gốc tại <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[property="article:section"]').attr('content') || 'Article';
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        // Pull out the main image
        let main_image, image_credit;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image, uri);
            main_image.set_title(title);
            image_credit = $('.sapo, .sapo font').text();
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find('.tinlienquan').removeAttr('class');
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        //Remove empty figure
        body.find('figure.multimedia-item').map(function(){
            const img = $(this).find('img').first()[0];
            if (!img) $(this).remove();
        });

        // //download image
        body.find('div[type="Photo"]').map(function() {
            const img =$(this).find('img').first();
            if(img[0]){
                const src=img[0].attribs.src;
                const alt=img[0].attribs.alt || '';
                const figcaption = $(this).find('.PhotoCMS_Caption').first().text();
                const figure = $(`<figure><img alt="${alt}" src="${src}" /></figure>`);
                img.remove();
                if (figcaption) figure.append($(`<figcaption><p>${figcaption}</p></figcaption>`));
                const image = libingester.util.download_img($(figure.children()[0]));
                image.set_title(title);
                hatch.save_asset(image);
                $(this).replaceWith(figure);
            }
            else {
                $(this).remove();
            }
        });
        const last_p = body.find('p').last();
        if(last_p.text().includes('TV Online')) last_p.remove();

        // Article Settings
        console.log('processing', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(Date.now(modified_date));
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_main_image(main_image,image_credit);
        asset.set_body(body);

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
        if (err.code == -1 || err.statusCode == 403) {
            console.log('Ingest error:' + err);
        }
    });
}

function main() {
    const hatch = new libingester.Hatch('vtv', 'vi');
    const ingest = (uri_rss) => {
        return new Promise((resolve, reject) => {
            rss2json.load(uri_rss, (err, rss) => {
                let promises = [];
                for (let i = 0; i < max_links; i++) {
                    const item = rss.items[i];
                        promises.push(ingest_article(hatch, item.url)); // ingest article
                }
                Promise.all(promises).then(() => resolve())
                    .catch((err) => reject());
            });
        })
    }

    Promise.all(rss_feed.map((rss_uri) => ingest(rss_uri))).then(() => {
        return hatch.finish();
    });
}

main();

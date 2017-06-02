'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const url = require('url');
const template = require('./template');

const BASE_URI = 'http://phununews.vn/';
const LINKS_ARTICLE = [
    'http://phununews.vn/tin-tuc/', // news
    'http://phununews.vn/giai-tri/', // entertainment
    'http://phununews.vn/thi-truong/', // market
    'http://phununews.vn/bat-dong-san/', // real estate
    'http://phununews.vn/doi-song/', // life
    'http://phununews.vn/tinh-yeu-hon-nhan/', // love
    'http://phununews.vn/me-va-be/ba-bau/', // mother
    'http://phununews.vn/lam-dep/thoi-trang/', // beauty
    'http://phununews.vn/suc-khoe/giam-can/', // health
    // video links
    'http://phununews.vn/video/giai-tri/',
    'http://phununews.vn/video/suc-khoe/',
    'http://phununews.vn/video/lam-dep-thoi-trang/',
    'http://phununews.vn/video/doi-song/',
    'http://phununews.vn/video/chuyen-la/',
    'http://phununews.vn/video/cuoi/',
    'http://phununews.vn/video/day-nau-an/',
    'http://phununews.vn/video/trang-diem/',
];
const MAX_LINKS = 3; // max links per 'rss'

// cleaning elements
const CLEAN_ELEMENTS = [
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
    'align',
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemprop',
    'itemscope',
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
    '.block_timer_share',
    '.brecrum_cate',
    '.orther_top',
    '.relative_new',
    '.title_news',
    '#phan-khuc',
    'span[onclick="ShowPopupSendMail()"]',
    'iframe',
    'noscript',
    'script',
    'style',
];

// delete duplicated elements in array
Array.prototype.unique=function(a){
  return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The objec {} with metadata (uri, author, etc)
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const body = $('#box_details_news').first();
        const category = $('.brecrum_cate').clone();
        const copyright = $('meta[name="copyright"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const published = $('.block_timer').first().text().replace(/[\s]{2,}/g,'').replace('|',' | ').replace('G',' G'); // for template
        const modified_time = $('meta[property="article:modified_time"]').attr('content')+published.split('|')[1]; // for asset
        const keywords = $('.block_tag').clone();
        const section = $('meta[property="article:section"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find('.tinlienquan').removeAttr('class'); //
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));
        clean_tags(category.find(CLEAN_ELEMENTS.join(',')));
        body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));

        // generating tags
        const categories = cheerio('<div></div>');
        category.find('a').get().map((a) => {
            categories.append(cheerio(`<a href="${url.resolve(BASE_URI,a.attribs.href)}">${$(a).text()}</a>`));
        });
        const tags = cheerio('<div></div>');
        keywords.find('a').get().map((a) => {
            tags.append(cheerio(`<a href="${url.resolve(BASE_URI,a.attribs.href)}">${a.attribs.title}</a>`));
        });

        // download images
        let thumb;
        body.find('img').get().map((img) => {
            clean_attr(img);
            img.attribs.src = url.resolve(BASE_URI, img.attribs.src);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
            if (!thumb) {
                asset.set_thumbnail(thumb = image);
            }
        });

        // download main image
        let main_image;
        if (!thumb) {
            main_image = libingester.util.download_image(uri_thumb);
            asset.set_thumbnail(main_image);
            hatch.save_asset(main_image);
        }

        const content = mustache.render(template.structure_template, {
            body: body.html(),
            category: categories.html(),
            main_image: main_image,
            published_date: published,
            tags: tags.html(),
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

/** ingest_video
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The objec {} with metadata (uri, author, etc)
 */
function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[name="description"]').attr('content');
        const dwn = $('.videogular-container').first().parent().attr('data-ng-init');
        const download_uri = dwn.substring(dwn.indexOf('http'), dwn.indexOf('mp4')+3);
        const published = $('.block_timer').first().text().replace(/[\s]{2,}/g,'').replace('|',' | ').replace('G',' G');
        const modified_time = $('meta[property="article:modified_time"]').attr('content')+published.split('|')[1];
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // download thumbnail
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_synopsis(description);
        asset.set_thumbnail(thumb);
        asset.set_title(title);

        //save assets
        hatch.save_asset(thumb);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();
    let links = [];

    function get_links(f) {
        return Promise.all(
            LINKS_ARTICLE.map((uri) =>
                libingester.util.fetch_html(uri).then(($) => {
                    let promises = [];
                    const uris = $('.txt_link').get().map(a => url.resolve(BASE_URI, a.attribs.href));
                    for (let i=0; i<MAX_LINKS; i++) {
                        const link = uris[i];
                        if (link) {
                            links.push(link);
                        }
                    }
                })
            )
        ).then(f);
    }

    get_links(() => {
        Promise.all(links.unique().map((uri) => {
            if (uri.includes('/video/')) {
                return ingest_video(hatch, uri);    // ingest video
            } else {
                return ingest_article(hatch, uri);  // ingest article
            }
        })).then(() => {
            return hatch.finish();
        })
    });
}

main();

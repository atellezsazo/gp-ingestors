'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://phununews.vn/';
const LINKS_BY_CATEGORY = [
    'http://phununews.vn/tin-tuc/', // news
    'http://phununews.vn/giai-tri/', // entertainment
    'http://phununews.vn/thi-truong/', // market
    'http://phununews.vn/bat-dong-san/', // real estate
    'http://phununews.vn/doi-song/', // life
    'http://phununews.vn/tinh-yeu-hon-nhan/', // love
    'http://phununews.vn/me-va-be/', // mother and baby
    'http://phununews.vn/lam-dep/', // beauty
    'http://phununews.vn/suc-khoe/', // health
    'http://phununews.vn/video/', // video links
    'http://phununews.vn/nau-an/', // cooking
    'http://phununews.vn/nha-dep/', // decoration
    'http://phununews.vn/anh/', // images (gallery)
    // 'http://phununews.vn/video/suc-khoe/',
    // 'http://phununews.vn/video/lam-dep-thoi-trang/',
    // 'http://phununews.vn/video/doi-song/',
    // 'http://phununews.vn/video/chuyen-la/',
    // 'http://phununews.vn/video/cuoi/',
    // 'http://phununews.vn/video/day-nau-an/',
    // 'http://phununews.vn/video/trang-diem/',
];

// max links per page (Average per page: 17 links)
const MAX_LINKS = 2;

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
    'onclick',
    'onmouseover',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    'style',
];

// delete duplicated elements in array
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// get articles metadata
function _get_ingest_settings($) {
    const canonical_uri = $('meta[property="og:url"]').attr('content');
    const date = $('meta[property="article:modified_time"]').attr('content');
    return {
        author: $('meta[property="og:site_name"]').attr('content'), // no authors
        body: $('#content-subject-detail').first(),
        canonical_uri: canonical_uri,
        date_published: Date.now(date),
        lede: $(`<p>${$('.short_intro').text()}</p>`),
        modified_date: new Date(Date.parse(date)),
        // custom_scss: CUSTOM_SCSS,
        read_more: `Baca lebih lanjut tentang <a href="${canonical_uri}">phununews.vn</a>`,
        section: $('meta[property="article:section"]').attr('content') || $('.color1').text(),
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'phununews.vn',
        title: $('meta[property="og:title"]').attr('content'),
    }
}

// set articles metadata
function _set_ingest_settings(asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
    if (meta.body) asset.set_body(meta.body)
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.lede) asset.set_lede(meta.lede);
    if (meta.read_more) asset.set_read_more_link(meta.read_more);
    if (meta.section) asset.set_section(meta.section);
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
}

/** download images for body **/
function _download_image($, meta, hatch, asset) {
    let thumbnail;
    const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
    // const download = (elem) => {
    //     if (elem.attribs.src) {
    //         clean_attr(elem);
    //         const image = libingester.util.download_img($(elem));
    //         image.set_title(meta.title);
    //         hatch.save_asset(image);
    //         if (!thumbnail) asset.set_thumbnail(thumbnail = image);
    //     }
    // }
    meta.body.find('img').map((i, elem) => {
        if (elem.attribs.src) {
            // find the parent's for the replace it by tag figure
            let parent = $(elem).parent();
            let img = $(elem).clone();
            let name;
            while (parent[0]) { console.log(parent[0].name);
                if (parent[0].name == 'p' || parent[0].name == 'table') {
                    name = parent[0].name;
                    parent[0].name = 'figure';
                    parent.children().remove();
                    parent.append(img);
                    break;
                } else if(parent[0].attribs.id == 'content-subject-detail'){
                    break;
                } else {
                    parent = parent.parent();
                }
            }

            // download image
            clean_attr(elem);
            const image = libingester.util.download_img(parent.children());
            image.set_title(meta.title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            
            // find figcation for this image

                let figcaption = parent.next();
                parent.append($(`<figcaption>${figcaption.text()}</figcaption>`));
                figcaption.remove();
            } else if (name == 'table'){

            }
        } else {
            $(elem).remove();
        }
        // if ($(elem).parent()[0].name == 'figure') {
        //     download(elem);
        // } else {
        //     let $tag = $(elem);
        //     while ($tag.parent()[0]) {
        //         if ($tag.parent()[0].name != 'figure') {
        //             $tag = $tag.parent();
        //         } else {
        //             $tag.replaceWith($(elem));
        //         }
        //     }
        //     download(elem);
        // }
    });
    return thumbnail;
}

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The objec {} with metadata (uri, author, etc)
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        // // const body = $('#box_details_news').first();
        // const category = $('.brecrum_cate').clone();
        // // const copyright = $('meta[name="copyright"]').attr('content');
        // const description = $('meta[property="og:description"]').attr('content');
        // const published = $('.block_timer').first().text().replace(/[\s]{2,}/g,'').replace('|',' | ').replace('G',' G'); // for template
        // const modified_time = $('meta[property="article:modified_time"]').attr('content')+published.split('|')[1]; // for asset
        // const keywords = $('.block_tag').clone();
        // const section = $('meta[property="article:section"]').attr('content');
        // const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // article settings
        console.log('processing',meta.title);
        // asset.set_canonical_uri(uri);
        // asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        // asset.set_license(copyright);
        // asset.set_section(section);
        // asset.set_synopsis(description);
        // asset.set_title(title);

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find('.tinlienquan').removeAttr('class');
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));
        meta.body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));

        // generating tags
        // const categories = $('<div></div>');
        // category.find('a').get().map((a) => {
        //     categories.append($(`<a href="${url.resolve(BASE_URI,a.attribs.href)}">${$(a).text()}</a>`));
        // });
        // const tags = $('<div></div>');
        // keywords.find('a').get().map((a) => {
        //     tags.append($(`<a href="${url.resolve(BASE_URI,a.attribs.href)}">${a.attribs.title}</a>`));
        // });

        // download images
        let thumbnail = _download_image($, meta, hatch, asset);
        // meta.body.find('img').get().map(img => {
        //     clean_attr(img);
        //     img.attribs.src = url.resolve(BASE_URI, img.attribs.src);
        //     const image = libingester.util.download_img(img);
        //     image.set_title(meta.title);
        //     hatch.save_asset(image);
        //     if (!thumbnail) asset.set_thumbnail(thumbnail = image);
        // });

        // download main image
        if (!thumbnail) {
            const image = libingester.util.download_image(uri_thumb);
            image.set_title(meta.title);
            asset.set_thumbnail(image);
            asset.set_main_image(image, '');
            hatch.save_asset(image);
        }
        meta.body.find('p').filter((i,p) => $(p).text().trim() === '').remove();

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => console.log(err));
}

/** ingest_video
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The objec {} with metadata (uri, author, etc)
 */
function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[name="description"]').attr('content');
        const dwn = $('.videogular-container').first().parent().attr('data-ng-init');
        const download_uri = dwn.substring(dwn.indexOf('http'), dwn.indexOf('mp4')+3);
        const published = $('.block_timer').first().text().replace(/[\s]{2,}/g,'').replace('|',' | ').replace('G',' G');
        const modified_time = $('meta[property="article:modified_time"]').attr('content')+published.split('|')[1];
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        console.log('processing',title);
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

/** _fetch_all_links (Promise)
 * @param {Array} links The list of links
 * @param {Number} max The max number of links per page
 */
function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const category = link.replace(BASE_URI,'');
        const all_uris = []; // all uris (only by category)
        // clean links from other categories
        $('.txt_link').map((i,a) => {
            const uri = url.resolve(BASE_URI, a.attribs.href);
            if (uri.includes(category)) all_uris.push(uri);
        });
        // concatenate uris (only max number)
        all_links = all_links.concat(all_uris.slice(0,max));
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

/** _ingest_by_category (return Promise)
 * @param {Object} hatch The list of links
 * @param {String} uri The max number of links per page
 */
function _ingest_by_category(hatch, uri) {
    const category = uri.replace(BASE_URI,'');
    switch (category) {
        case 'video/': return ingest_video(hatch, uri);
        default: return ingest_article(hatch, uri);
    }
}


function main() {
    const hatch = new libingester.Hatch('phununews', 'vi');

    // _fetch_all_links(LINKS_BY_CATEGORY, MAX_LINKS).then(links => {
    //     Promise.all(links.map(uri => _ingest_by_category(hatch, uri)))
    //         .then(() => hatch.finish());
    // });
    const uri = 'http://phununews.vn/tinh-yeu-hon-nhan/cai-ket-bat-ngo-co-gai-thue-doi-xe-om-gia-nha-trai-sau-khi-bi-ban-trai-huy-hon-188833/';
    ingest_article(hatch, uri)
    .then(() => hatch.finish());
}

main();

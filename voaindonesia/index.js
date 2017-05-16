'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://www.voaindonesia.com/';
const post_uris = [
    'http://www.voaindonesia.com/z/585', //audios
    'http://www.voaindonesia.com/api/', //berita
    'http://www.voaindonesia.com/api/zp-oqe-yiq',
    'http://www.voaindonesia.com/api/zo-ovegyit'
];

Array.prototype.unique=function(a){ // delete duplicated elements in array
  return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// remove attrib tags
const remove_tag_attributes = [
    'class',
    'src'
];

// remove element (body)
const remove_body_elements = [
    '.buttons',
    '.clear',
    '.embed-player-only',
    '.infgraphicsAttach',
    '.load-more',
    '.player-and-links'
];

// Util functions
const remove_elements = ($object, elements) => {
    for (const element of elements) {
        $object.find(element).remove();
    }
}

const remove_attributes = ($object, attributes) => {
    for (const attr of attributes) {
        delete $object.attribs[attr];
    }
}

const download_image = (hatch, uri) => {
    if (uri) {
        const main_img = libingester.util.download_image(uri);
        hatch.save_asset(main_img);
        return main_img;
    }
}

const download_img = (hatch, img) => {
    let src = img.attribs.src;
    if (src) {
        src = src.replace('_q10', ''); // for better quality images
        src = src.replace('w250', 'w650');
        const image = download_image(hatch, src);
        img.attribs["data-libingester-asset-id"] = image.asset_id;
        remove_attributes(img, remove_tag_attributes);
    }
}

const download_video = (hatch, data) => {
    if (data.download_uri) {
        const video = new libingester.VideoAsset();
        video.set_canonical_uri(data.canonical_uri);
        video.set_download_uri(data.download_uri);
        video.set_last_modified_date(data.modified_date);
        video.set_license(data.license);
        video.set_thumbnail(data.thumbnail);
        video.set_title(data.title);
        video.set_synopsis(data.synopsis);
        hatch.save_asset(video);
        return video;
    }
}

const get_post_data = ($, asset) => {
    // set title section
    const title = $('meta[property="og:title"]').attr('content');
    asset.set_title(title);

    // pull out the updated date
    const section_type = $('meta[property="og:type"]').attr('content');
    asset.set_section(section_type);

    // data for template
    const $post_content = $('#content').first();
    const $publishing_details =$post_content.find('.publishing-details').first();
    const authors = $publishing_details.find('.authors').first();
    const category = $post_content.find('.category').first();
    const published = $publishing_details.find('.published').first();

    // modified date
    const modified_date = published.find('time').attr('datetime');
    let date = new Date( Date.parse(modified_date) );
    if (!date){
        date = new Date();
    }
    asset.set_last_modified_date(date);

    // fixing relative paths
    authors.find('a').get().map((a) => a.attribs['href'] = url.resolve(base_uri, a.attribs.href || '#'));
    category.find('a').get().map((a) => a.attribs['href'] = url.resolve(base_uri, a.attribs.href || '#'));
    published.find('a').get().map((a) => a.attribs['href'] = url.resolve(base_uri, a.attribs.href || '#'));

    return {
        authors: authors,
        category: category,
        date: date,
        published: published,
        title: title,
    };
}

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

// ---------- Ingestor Functions
function $ingest_gallery(hatch, asset, $, uri, resolved) { // ingest post gallery
    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content #article-content .wsw').first();
    //body_content.find(remove_body_elements).remove(); //+
    remove_elements(body_content, remove_body_elements);
    body_content.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href || '#'));
    body_content.find('img').get().map((img) => download_img(hatch, img));

    let gallery = [];
    const post_gallery = ($page, finish_process) => {
        const body_gallery = $page('#content #galleryItems').first();
        const relative_show_more = $page('#content .link-showMore').attr('href');
        remove_elements(body_gallery, remove_body_elements);
        body_gallery.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href || '#'));
        body_gallery.find('img').get().map((img) => download_img(hatch, img));
        gallery.push(body_gallery.html());

        if (relative_show_more) {
            const show_more = url.resolve(base_uri, relative_show_more);
            libingester.util.fetch_html(show_more).then(($next_page) => {
                post_gallery($next_page, finish_process);
            });
        } else {
            finish_process();
        }
    }

    post_gallery($, () => {
        post_data['body_content'] = body_content;
        post_data['body_gallery'] = gallery.join('');
        render_template(hatch, asset, template.template_gallery, post_data);
        resolved();
    });
}

function $ingest_article(hatch, asset, $, uri, resolved) { // ingest post article
    // download main image
    const url_main_image = $('meta[property="og:image"]').attr('content');
    const main_image = download_image(hatch, url_main_image);
    const main_image_caption = $('#content .media-pholder .caption').first();

    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content .body-container .wsw').first();
    remove_elements(body_content, remove_body_elements);
    body_content.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href || '#'));
    body_content.find('img').get().map((img) => download_img(hatch, img));
    body_content.find('iframe').get().map((iframe) => download_video(hatch, {
        canonical_uri: uri,
        download_uri: iframe.src,
        modified_date: post_data.date,
        title: post_data.title
    }));

    // render template
    post_data['main_image_id'] = main_image.asset_id;
    post_data['main_image_caption'] = main_image_caption.text();
    post_data['body'] = body_content.html();
    render_template(hatch, asset, template.template_article, post_data);
    resolved();
}

function $ingest_media(hatch, asset, $, uri, resolved) { // ingest post video or post audio
    // download main image
    const url_main_image = $('meta[property="og:image"]').attr('content');
    const main_image = download_image(hatch, url_main_image);

    // modified date
    const published = $('.publishing-details time').first().attr('datetime');
    let date = new Date( Date.parse(published) );
    if (!date) {
        date = new Date();
    }

    // video data
    const description = $('#content .intro').first().text();
    const post_data = get_post_data($, asset);
    const video = $('#content video').first()[0] || $('#content audio').first()[0];
    const download_uri = video.attribs.src;
    const title = $('meta[property="og:title"]').attr('content');

    download_video(hatch, {
        canonical_uri: uri,
        download_uri: download_uri,
        modified_date: date,
        thumbnail: main_image,
        title: title,
        synopsis: description
    });
    resolved();
}

function main() {
    const hatch = new libingester.Hatch();
    let links = [];

    const ingest_promise = () => { // ingest one post
        return Promise.all(links.unique().map((uri) => {
            return new Promise((resolve, reject) => {
                libingester.util.fetch_html(uri).then(($) => {
                    const asset = new libingester.NewsArticle();
                    asset.set_canonical_uri(uri);
                    const type = $('meta[name="twitter:card"]').attr('content') || $('meta[property="twitter:card"]').attr('content');
                    switch (type) {
                        case 'gallery': $ingest_gallery(hatch, asset, $, uri, resolve); break;
                        case 'player': $ingest_media(hatch, asset, $, uri, resolve); break;
                        case 'summary': /*$ingest_media(hatch, asset, $, uri, resolve); */ break;
                        case 'summary_large_image': $ingest_article(hatch, asset, $, uri, resolve); break;
                    }
                });
            });
        }));
    }

    const set_links = (link) => { // resolve url's and ingest a post
        return new Promise((resolve, reject) => {
            if( link.includes('api') ) { //rss
                rss2json.load(link, function(err, rss) {
                    rss.items.map((item) =>  links.push(item.url));
                    resolve();
                });
            } else {
                libingester.util.fetch_html(link).then(($) => {
                    const page_uris = $('ul#items').find('a.img-wrap').map(function() {
                        links.push(url.resolve(base_uri, this.attribs.href));
                        resolve();
                    }).get();
                })
            }
        });
    }

    Promise.all(post_uris.map((link) => set_links(link))).then(() => {
        ingest_promise().then(() => {
            return hatch.finish();
        });
    });
}

main();

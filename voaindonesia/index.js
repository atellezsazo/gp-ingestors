'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://www.voaindonesia.com/';
const url_audio = 'http://www.voaindonesia.com/z/585'; //page
const url_berita = 'http://www.voaindonesia.com/api/zmgqoe$moi'; //rss
const url_gallery = 'http://www.voaindonesia.com/api/zp-oqe-yiq'; //rss
const url_video = 'http://www.voaindonesia.com/api/zo-ovegyit'; //rss

// remove attrib tags
const remove_tag_attributes = [
    'class',
    'src',
];

// remove element (body)
const remove_body_elements = [
    '.buttons',
    '.clear',
    '.embed-player-only',
    '.infgraphicsAttach',
    '.load-more',
    '.player-and-links',
];

// Util functions
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

const fix_relative_paths = ($object) => {
    $object.find('a').map(function() { // fixing relative paths
        this.attribs['href'] = url.resolve(base_uri, this.attribs.href);
    });
}

const remove_elements = ($object, elements) => {
    for(const element of elements){
        $object.find(element).remove();
    }
}

const remove_attributes = ($object, attributes) => {
    for(const attr of attributes){
        delete $object.attribs[attr];
    }
}

const download_image = (hatch, uri) => {
    if( uri ){
        const main_img = libingester.util.download_image(uri);
        hatch.save_asset(main_img);
        return main_img;
    }
}

const download_img = (hatch, img) => {
    let src = img.attribs.src;
    if( src ){
        src = src.replace('_q10',''); //for better quality images
        const image = libingester.util.download_image( src );
        img.attribs["data-libingester-asset-id"] = image.asset_id;
        remove_attributes(img, remove_tag_attributes);
        hatch.save_asset(image);
    }
}

const download_images = (hatch, $object) => {
    $object.find('img').map(function() {
        download_img(hatch, this);
    });
}

const download_video = (hatch, uri, date, title) => {
    if( uri ){
        const video = new libingester.VideoAsset();
        video.set_canonical_uri(uri);
        video.set_last_modified_date(date);
        video.set_title(title);
        video.set_download_uri(uri);
        hatch.save_asset(video);
        return video;
    }
}

const download_videos = (hatch, $object, date, title) => {
    $object.find('iframe').map(function() {
        download_video(hatch, this.attribs.src, date, title);
    });
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
    if( !date ){
        date = new Date();
    }
    asset.set_last_modified_date(date);

    fix_relative_paths(authors);
    fix_relative_paths(category);
    fix_relative_paths(published);

    return {
        authors: authors,
        category: category,
        date: date,
        published: published,
        title: title,
    };
}

// ---------- Ingestor Functions
function $ingest_gallery(hatch, asset, $, uri) {                        // ingest post gallery
    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content #article-content .wsw').first();
    remove_elements(body_content, remove_body_elements);
    fix_relative_paths(body_content);
    download_images(hatch, body_content);

    let gallery = [];
    const post_gallery = ($page, finish_process) => {
        const body_gallery = $page('#content #galleryItems').first();
        const relative_show_more = $page('#content .link-showMore').attr('href');
        remove_elements(body_gallery, remove_body_elements);
        fix_relative_paths(body_gallery);
        download_images(hatch, body_gallery);
        gallery.push( body_gallery.html() );

        if( relative_show_more ){
            const show_more = url.resolve(base_uri, relative_show_more);
            libingester.util.fetch_html(show_more).then(($next_page) => {
                post_gallery($next_page, finish_process);
            });
        } else {
            finish_process();
        }
    }

    return new Promise((resolve, reject) => {
        post_gallery($, () => {
            post_data['body_content'] = body_content;
            post_data['body_gallery'] = gallery.join('');
            render_template(hatch, asset, template.template_gallery, post_data);
            resolve();
        });
    });
}

function $ingest_article(hatch, asset, $, uri) {                        // ingest post article
    return new Promise((resolve, reject) => {
        // download main image
        const url_main_image = $('meta[property="og:image"]').attr('content');
        const main_image = download_image(hatch, url_main_image);
        const main_image_caption = $('#content .media-pholder .caption').first();

        // post data
        let post_data = get_post_data($, asset);
        const body_content = $('#content .body-container .wsw').first();
        remove_elements(body_content, remove_body_elements);
        fix_relative_paths(body_content);
        download_images(hatch, body_content);
        download_videos(hatch, body_content, post_data.date, post_data.title);

        // render template
        post_data['main_image_id'] = main_image.asset_id;
        post_data['main_image_caption'] = main_image_caption.text();
        post_data['body'] = body_content.html();
        render_template(hatch, asset, template.template_article, post_data);
        resolve();
    });
}

function $ingest_video_post(hatch, asset, $, uri) {                     // ingest post video
    return new Promise((resolve, reject) => {
        // download main image
        const url_main_image = $('meta[property="og:image"]').attr('content');
        const main_image = download_image(hatch, url_main_image);

        // post data
        let post_data = get_post_data($, asset);
        const body_content = $('#content .intro').first();
        remove_elements(body_content, remove_body_elements);

        // download video
        const video_url = $('#content video').first()[0].attribs.src;
        download_video(hatch, video_url, post_data.date, post_data.title);

        // render template
        post_data['main_image_id'] = main_image.asset_id;
        post_data['body'] = body_content.html();
        render_template(hatch, asset, template.template_video_post, post_data);
        resolve();
    });
}

function $ingest_audio_post(hatch, asset, $, uri) {                     // ingest post audio
    return new Promise((resolve, reject) => {
        // download main image
        const url_main_image = $('meta[property="og:image"]').attr('content');
        const main_image = download_image(hatch, url_main_image);

        // post data
        let post_data = get_post_data($, asset);
        const body_content = $('#content .intro').first();
        remove_elements(body_content, remove_body_elements);

        // download audio as video
        const video_url = $('#content audio').first()[0].attribs.src;
        download_video(hatch, video_url, post_data.date, post_data.title);

        // render template
        post_data['main_image_id'] = main_image.asset_id;
        post_data['body'] = body_content.html();
        render_template(hatch, asset, template.template_video_post, post_data);
        resolve();
    });
}

function ingest(hatch, uri, $ingest_function) {                         // main ingest
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);
        return $ingest_function(hatch, asset, $, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    const audio_promise = new Promise((resolve, reject) => {
        libingester.util.fetch_html(url_audio).then(($) => {
            const page_uris = $('ul#items').find('a.img-wrap').map(function() {
                return url.resolve(base_uri, this.attribs.href);
            }).get();
            Promise.all(page_uris.map((uri) => ingest(hatch, uri, $ingest_audio_post))).then(() => {
                resolve();
            });
        })
    });

    const berita_promise = new Promise((resolve, reject) => {
        rss2json.load(url_berita, function(err, rss) {
            const rss_uris = rss.items.map((datum) => datum.url);
            Promise.all(rss_uris.map((uri) => ingest(hatch, uri, $ingest_article))).then(() => {
                resolve();
            });
        });
    });

    const gallery_promise = new Promise((resolve, reject) => {
        rss2json.load(url_gallery, function(err, rss) {
            const rss_uris = rss.items.map((datum) => datum.url);
            Promise.all(rss_uris.map((uri) => ingest(hatch, uri, $ingest_gallery))).then(() => {
                resolve();
            });
        });
    });

    const video_promise = new Promise((resolve, reject) => {
        rss2json.load(url_video, function(err, rss) {
            const rss_uris = rss.items.map((datum) => datum.url);
            Promise.all(rss_uris.map((uri) => ingest(hatch, uri, $ingest_video_post))).then(() => {
                resolve();
            });
        });
    });

    const promises = [
        audio_promise,
        berita_promise,
        gallery_promise,
        video_promise,
    ];

    Promise.all(promises).then(() => { console.log('finish');
        return hatch.finish();
    });
}

main();

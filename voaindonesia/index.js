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
        const image = download_image(hatch, src);
        img.attribs["data-libingester-asset-id"] = image.asset_id;
        remove_attributes(img, remove_tag_attributes);
    }
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
function $ingest_gallery(hatch, asset, $, uri, resolved) {            // ingest post gallery
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
        //body_gallery.find(remove_body_elements).remove(); //+
        remove_elements(body_gallery, remove_body_elements);
        body_gallery.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href || '#'));
        body_gallery.find('img').get().map((img) => download_img(hatch, img));
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

    post_gallery($, () => {
        post_data['body_content'] = body_content;
        post_data['body_gallery'] = gallery.join('');
        render_template(hatch, asset, template.template_gallery, post_data);
        resolved();
    });
}

function $ingest_article(hatch, asset, $, uri, resolved) {            // ingest post article
    // download main image
    const url_main_image = $('meta[property="og:image"]').attr('content');
    const main_image = download_image(hatch, url_main_image);
    const main_image_caption = $('#content .media-pholder .caption').first();

    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content .body-container .wsw').first();
    //body_content.find(remove_body_elements).remove(); //+
    remove_elements(body_content, remove_body_elements);
    body_content.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href || '#'));
    body_content.find('img').get().map((img) => download_img(hatch, img));
    body_content.find('iframe').get().map((iframe) => download_video(hatch, iframe.attribs.src, date, title));

    // render template
    post_data['main_image_id'] = main_image.asset_id;
    post_data['main_image_caption'] = main_image_caption.text();
    post_data['body'] = body_content.html();
    render_template(hatch, asset, template.template_article, post_data);
    resolved();
}

function $ingest_video_post(hatch, asset, $, uri, resolved) {         // ingest post video
    // download main image
    const url_main_image = $('meta[property="og:image"]').attr('content');
    const main_image = download_image(hatch, url_main_image);

    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content .intro').first();
    //body_content.find(remove_body_elements).remove(); //+
    remove_elements(body_content, remove_body_elements);

    // download video
    const video_url = $('#content video').first()[0].attribs.src;
    download_video(hatch, video_url, post_data.date, post_data.title);

    // render template
    post_data['main_image_id'] = main_image.asset_id;
    post_data['body'] = body_content.html();
    render_template(hatch, asset, template.template_video_post, post_data);
    resolved();
}

function $ingest_audio_post(hatch, asset, $, uri, resolved) {         // ingest post audio
    // download main image
    const url_main_image = $('meta[property="og:image"]').attr('content');
    const main_image = download_image(hatch, url_main_image);

    // post data
    let post_data = get_post_data($, asset);
    const body_content = $('#content .intro').first();
    //body_content.find(remove_body_elements).remove(); //+
    remove_elements(body_content, remove_body_elements);

    // download audio as video
    const video_url = $('#content audio').first()[0].attribs.src;
    download_video(hatch, video_url, post_data.date, post_data.title);

    // render template
    post_data['main_image_id'] = main_image.asset_id;
    post_data['body'] = body_content.html();
    render_template(hatch, asset, template.template_video_post, post_data);
    resolved();
}

function main() {
    const hatch = new libingester.Hatch();

    const ingest_promise = (hatch, uri, $ingest_function) => { // ingest one post
        return new Promise((resolve, reject) => {
            libingester.util.fetch_html(uri).then(($) => {
                const asset = new libingester.NewsArticle();
                asset.set_canonical_uri(uri);
                $ingest_function(hatch, asset, $, uri, resolve); // ingest specific post
            });
        });
    }

    const ingest = (uri, $ingest_function, resolved) => { // resolve url's and ingest a post
        if( uri.includes('api') ) { //rss
            rss2json.load(uri, function(err, rss) {
                Promise.all(rss.items.map((item) => ingest_promise(hatch, item.url, $ingest_function))).then(() => resolved());
            });
        } else {
            libingester.util.fetch_html(url_audio).then(($) => {
                const page_uris = $('ul#items').find('a.img-wrap').map(function() {
                    return url.resolve(base_uri, this.attribs.href || '');
                }).get();
                Promise.all(page_uris.map((uri) => ingest_promise(hatch, uri, $ingest_function))).then(() => resolved());
            })
        }
    }

    // const audio = new Promise((resolve, reject) => ingest(url_audio, $ingest_audio_post, resolve));
    const berita = new Promise((resolve, reject) => ingest('http://www.voaindonesia.com/api/', $ingest_article, resolve));
    // const gallery = new Promise((resolve, reject) => ingest(url_gallery, $ingest_gallery, resolve));
    // const video = new Promise((resolve, reject) => ingest(url_video, $ingest_video_post, resolve));

    Promise.all([berita]).then(() => {
        return hatch.finish();
    });
}

main();

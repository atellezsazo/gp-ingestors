'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://www.voaindonesia.com/';
const page_urls = [
    'http://www.voaindonesia.com/z/585',  //audio posts
];
const rss_urls = [
    'http://www.voaindonesia.com/api/zo-ovegyit', //video posts
    'http://www.voaindonesia.com/api/zmgqoe$moi', //berita posts
    'http://www.voaindonesia.com/api/zp-oqe-yiq', //gallery posts
];

// remove attrib tags
const remove_attrs = [
    'class',
    'src',
];

// remove element (body)
const remove_elements = [
    '.buttons',
    '.clear',
    '.embed-player-only',
    '.infgraphicsAttach',
    '.load-more',
    '.player-and-links',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        // set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // data for template
        const publishing_details = $profile('.publishing-details');
        const published = publishing_details.find('.published').first();
        const authors = publishing_details.find('.authors').first();
        const category = $profile('.category').first();
        category.find('a').map(function() { // fixing relative paths
            this.attribs['href'] = url.resolve(base_uri, this.attribs.href);
        });
        authors.find('a').map(function() { // fixing relative paths
            this.attribs['href'] = url.resolve(base_uri, this.attribs.href);
        });

        // pull out the updated date
        const section_type = $profile('meta[property="og:type"]').attr('content');
        const modified_date = $profile(published).find('time').attr('datetime');
        asset.set_last_modified_date(new Date( Date.parse(modified_date) ));
        asset.set_section(section_type);

        // template data (body and main image)
        const body_gallery = $profile('div.container').find('div#galleryItems');
        const body_video = $profile('div.container').find('div.intro').first();
        const body_post = $profile('div.body-container').find('div.wsw').first();
        let body; // content post
        let main_img; // main image
        let main_img_caption; // main image description

        // download main image
        const download_main_image = () => {
            const url_main_image = $profile('meta[property="og:image"]').attr('content');
            main_img = libingester.util.download_image(url_main_image);
            main_img_caption =  $profile('div.image').find('p[itemprop="caption"]').first().html();
            hatch.save_asset(main_img);
        }

        // body depends of the post type
        if ( body_post[0] ) {             // data for 'article post'
            body = body_post;
            download_main_image();
        } else if ( body_video[0] ) {      // data for 'video post'
            body = body_video;
            download_main_image();
        } else if ( body_gallery[0] ) {    // data for 'gallery post'
            body = body_gallery;
        }

        // remove elements from body
        for(const element of remove_elements){
            body.find(element).remove();
        }

        // fixing relative paths
        body.find('a').map(function() {
            this.attribs['href'] = url.resolve(base_uri, this.attribs.href);
        });

        // download images
        body.find('img').map(function(){
            let src = this.attribs.src;
            if( src ){
                src = src.replace('_q10',''); //for better quality images
                const image = libingester.util.download_image( src );
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for(const attr of remove_attrs){
                    delete this.attribs[attr];
                }
                hatch.save_asset(image);
            }
        });

        // download videos
        const videos = $profile('div.html5Player').find('video').map(function() {
            const video_url = this.attribs.src;
            const video_asset = new libingester.VideoAsset();
            video_asset.set_canonical_uri(video_url);
            video_asset.set_last_modified_date(modified_date);
            video_asset.set_title(title);
            video_asset.set_download_uri(video_url);
            hatch.save_asset(video_asset);
        });

        // download audios
        const audios = $profile('div.html5Player').find('audio').map(function() {
            const audio_url = this.attribs.src;
            const audio_asset = new libingester.VideoAsset();
            audio_asset.set_canonical_uri(audio_url);
            audio_asset.set_last_modified_date(modified_date);
            audio_asset.set_title(title);
            audio_asset.set_download_uri(audio_url);
            hatch.save_asset(audio_asset);
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            category: category.html(),
            published: published.html(),
            authors: authors.html(),
            main_img: main_img,
            image_description: main_img_caption,
            body: body.html(),
        });

        // save document
        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();

    const rss_promises = rss_urls.map(function(rss_url) {
        return new Promise((resolve, reject) => {
            rss2json.load(rss_url, function(err, rss) {
                const rss_uris = rss.items.map((datum) => datum.url);
                Promise.all(rss_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
                    resolve();
                });
            });
        });
    });

    const page_promises = page_urls.map(function(page_url) {
        return new Promise((resolve, reject) => {
            libingester.util.fetch_html(page_url).then(($) => {
                const page_uris = $('ul#items').find('a.img-wrap').map(function() {
                    return url.resolve(base_uri, this.attribs.href);
                }).get();
                Promise.all(page_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
                    resolve();
                });
            })
        });
    });

    Promise.all( page_promises.concat(rss_promises) ).then(() => {
        return hatch.finish();
    });
}

main();

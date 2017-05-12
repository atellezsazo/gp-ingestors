'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'https://beritagar.id/';
const page_gallery = 'https://beritagar.id/spesial/foto/';
const page_video = 'https://beritagar.id/spesial/video/';
const rss_uri = 'https://beritagar.id/rss/';

// clean images
const remove_attr_img = [
    'class',
    'data-src',
    'src',
    'style',
];

//Remove elements (body)
const remove_elements = [
    '.article-recomended',
    '.article-sharer',
    '.article-sub-title',
    '.follow-bar',
    '.gallery-list',
    '.gallery-navigation',
    '.gallery-single',
    '.twitter-tweet',
    '.unread',
    '#commentFBDesktop',
    '#load-more-btn',
    '#opinibam',
    '#semar-placement',
    '#semar-placement-v2',
    'iframe',
    'script',
];

const remove_elements_header = [
    '.sponsored-socmed',
    'iframe',
    'script',
];

//embedded content
const video_iframes = [
    'youtube', //YouTube
];

// download images
const download_image = (hatch, that) => {
    if( that.attribs.src ){
        const image = libingester.util.download_image( that.attribs.src );
        that.attribs["data-libingester-asset-id"] = image.asset_id;
        for(const attr of remove_attr_img){
            delete that.attribs[attr];
        }
        hatch.save_asset(image);
    }
}

// download videos
const download_video = (hatch, that, date, title) => {
    let video_url = that.attribs.src;
    for (const video_iframe of video_iframes) {
        if (video_url.includes(video_iframe)) {
            const video = new libingester.VideoAsset();
            video.set_canonical_uri(video_url);
            video.set_last_modified_date(date);
            video.set_title(title);
            video.set_download_uri(video_url);
            hatch.save_asset(video);
        }
    }
}

// post data
const get_post_data = (hatch, asset, $, uri) => {
    asset.set_canonical_uri(uri);
    const section = $('meta[property="article:section"]').attr('content');
    asset.set_section(section);
    const title = $('meta[property="og:title"]').attr('content');
    asset.set_title(title);

    const modified_time = $('meta[property="article:modified_time"]').attr('content');
    let date = new Date(Date.parse(modified_time));
    if( !date ){
        date = new Date();
    }
    asset.set_last_modified_date(date);

    const $article_info = $('.article-info');

    // clean tag attributes
    const clean = ($tag) => {
        if($tag.length != 0){
            if( $tag[0].attribs ){
                for(const attr of remove_attr_img){
                    delete $tag[0].attribs[attr];
                }
            }
            $tag.contents().map(function() {
                if( this.attribs ){
                    for(const attr of remove_attr_img){
                        delete this.attribs[attr];
                    }
                }
            });
        }
    }

    const author = $article_info.find('address').first(); // author post
    const published = $article_info.find('time').first(); // published data
    for(const element of remove_elements_header){
        author.find(element).remove();
    }
    clean(author);
    clean(published);

    // download image (author avatar)
    author.find('img').map(function() {
        download_image(hatch, this);
    });

    return {
        author: author,
        date: date,
        published: published,
        title: title,
    };
}

// body post
const get_body = (hatch, $, post_data) => {
    const body = $('section.article-content').first();

    // download videos
    body.find('iframe').map(function() {
        download_video(hatch, this, post_data.date, post_data.title);
    });

    // remove body tags and comments
    for(const element of remove_elements){
        body.find(element).remove();
    }
    body.contents().filter((index, node) => node.type === 'comment').remove();

    // download images
    body.find('img').map(function() {
        download_image(hatch, this);
    });

    return body;
}

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

function ingest_article(hatch, uri) {
    return new Promise((resolve, reject) => {
        libingester.util.fetch_html(uri).then(($) => {
            const asset = new libingester.NewsArticle();
            let post_data = get_post_data(hatch, asset, $, uri);

            const article_header = $('.article-header .breadcrumb').first();
            const article_subtitle = $('.article-sub-title').first();
            const body = get_body(hatch, $, post_data);

            // fixing relative paths
            article_header.find('a').map(function () {
                this.attribs.href = url.resolve(base_uri, this.attribs.href);
            });

            // download background image
            let bg_img;
            const article_bg = $('.article-background-image').first();
            if( article_bg.length != 0 ) {
                const bg = article_bg[0].attribs.style; //get url
                const bg_img_uri = bg.substring(bg.indexOf('http'), bg.indexOf('jpg')+3);
                bg_img = libingester.util.download_image( bg_img_uri );
                hatch.save_asset(bg_img);
            }

            // download instagram images
            const instagram_promises = body.find('blockquote.instagram-media').map(function() {
                const href = $(this).find('a').first()[0].attribs.href;
                if( href ){
                    return libingester.util.fetch_html(href).then(($inst) => { // It is necessary to wait
                        const image_uri = $inst('meta[property="og:image"]').attr('content');
                        const image_description = $inst('meta[property="og:description"]').attr('content');
                        const image = libingester.util.download_image( image_uri );
                        hatch.save_asset(image);

                        // replace tag 'blockquote' by tag 'figure'
                        this['name'] = 'figure';
                        this['attribs'] = null;
                        this['children'] = [{
                                type: 'tag',
                                name: 'img',
                                attribs: {'data-libingester-asset-id': image.asset_id}
                            }, {
                                type: 'tag',
                                name: 'figcaption',
                                children: {
                                    type: 'text',
                                    data: image_description,
                                },
                        }];
                    });
                }
            }).get();

            Promise.all(instagram_promises).then(() => {
                post_data['article_tags'] = article_header;
                post_data['article_subtitle'] = article_subtitle;
                post_data['bg_img'] = bg_img;
                post_data['body'] = body.html();
                render_template(hatch, asset, template.structure_template, post_data);
                resolve();
            });
        }).catch((err) => {
            return ingest_article(hatch, uri);
        });
    });
}

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let post_data = get_post_data(hatch, asset, $, uri);

        const media_subtitle = $('.media-sub-title').first();
        const article_tags = $('#main .media-channel').first();
        const body = get_body(hatch, $, post_data);

        // fixing relative paths
        article_tags.find('a').map(function () {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });

        post_data['article_tags'] = article_tags;
        post_data['article_subtitle'] = media_subtitle;
        post_data['body'] = body.html();

        render_template(hatch, asset, template.structure_template, post_data);
    }).catch((err) => {
        return ingest_gallery(hatch, uri);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let post_data = get_post_data(hatch, asset, $, uri);

        const media_subtitle = $('.media-sub-title').first();
        const article_tags = $('#main .media-channel').first();

        // download background video (video post)
        let bg_img_video;
        const bg_img_video_uri = $('meta[property="og:image"]').attr('content');
        bg_img_video = libingester.util.download_image( bg_img_video_uri );
        hatch.save_asset(bg_img_video);
        $('#main').find('iframe').map(function() {
            download_video(hatch, this, post_data.date, post_data.title);
        });

        // fixing relative paths
        article_tags.find('a').map(function () {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });

        post_data['article_tags'] = article_tags;
        post_data['article_subtitle'] = media_subtitle;
        post_data['bg_img_video'] = bg_img_video;

        render_template(hatch, asset, template.structure_template, post_data);
    }).catch((err) => {
        return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    const ingest = (page_uri, resolved, concurrency = Infinity) => {
        if( page_uri.includes('rss') ) {
            rss2json.load(rss_uri, function(err, rss){
                Promise.map(rss.items, function(item) {
                    return ingest_article(hatch, item.url); // posrt article
                }, {concurrency: concurrency}).then(() => resolved());
            });
        } else {
            libingester.util.fetch_html(page_uri).then(($) => {
                const tags = $('#main .swifts .content a.title').get(); // more recent media links
                Promise.map(tags, function(tag) {
                    if( page_uri.includes('foto') ) { // media gallery
                        return ingest_gallery(hatch, url.resolve(base_uri, tag.attribs.href));
                    }else if( page_uri.includes('video') ) { // media video
                        return ingest_video(hatch, url.resolve(base_uri, tag.attribs.href));
                    }
                }, {concurrency: concurrency}).then(() => resolved());
            });
        }
    }

    const article = new Promise((resolve, reject) => ingest(rss_uri, resolve));
    const gallery = new Promise((resolve, reject) => ingest(page_gallery, resolve));
    const video = new Promise((resolve, reject) => ingest(page_video, resolve));

    Promise.all([article, gallery, video]).then(() => {
        return hatch.finish();
    });
}

main();

'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const rss_uri = 'https://beritagar.id/rss'; //Artists
const base_uri = 'https://beritagar.id/';

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
    '.unread',
    '#commentFBDesktop',
    '#load-more-btn',
    '#opinibam',
    '#semar-placement',
    '#semar-placement-v2',
    'blockquote',
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

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.NewsArticle();
        const section = $('meta[property="article:section"]').attr('content');
        asset.set_section(section);

        //Set title section
        const title = $('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date and section
        const modified_time = $('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        const article_info = $('.article-info');

        // download images
        const download_image = (that) => {
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
        const download_video = (that) => {
            let video_url = that.attribs.src;
            for (const video_iframe of video_iframes) {
                if (video_url.includes(video_iframe)) {
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(video_url);
                    video_asset.set_last_modified_date(modified_time);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(video_url);
                    hatch.save_asset(video_asset);
                }
            }
        }

        // data for article
        const body = $('section.article-content').first(); // body post
        const author = article_info.find('address').first(); // author post
        const published = article_info.find('time').first(); // published data
        const article_bg = $('.article-background-image').first(); // as the main image, appears sometimes
        const article_tags = $('#main .media-channel').first(); // article tags, appears sometimes
        const article_header = $('.article-header .breadcrumb').first(); // other article tags, appears sometimes
        const article_subtitle = $('.article-sub-title').first(); // article subtitle, appears sometimes
        const media_subtitle = $('.media-sub-title').first(); // media subtitle, appears sometimes (media post)

        // fix relative paths
        article_tags.find('a').map(function () {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });
        article_header.find('a').map(function () {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });

        // download background image
        let bg_img = false;
        if( article_bg.length != 0 ) {
            const bg = article_bg[0].attribs.style;
            const bg_img_uri = bg.substring(bg.indexOf('http'), bg.indexOf('jpg')+3);
            bg_img = libingester.util.download_image( bg_img_uri );
            hatch.save_asset(bg_img);
        }

        // download background video (video post)
        let bg_img_video = false;
        if( body.length == 0 ) {
            const bg_img_video_uri = $('meta[property="og:image"]').attr('content');
            bg_img_video = libingester.util.download_image( bg_img_video_uri );
            hatch.save_asset(bg_img_video);
            $('#main').find('iframe').map(function() {
                download_video(this);
            });
        }

        // download image (body)
        body.find('img').map(function() {
            download_image(this);
        });

        // download image (author avatar)
        author.find('img').map(function() {
            download_image(this);
        });

        // download videos
        body.find('iframe').map(function() {
            download_video(this);
        });

        // remove body tags and comments
        for(const element of remove_elements){
            body.find(element).remove();
        }
        for(const element of remove_elements_header){
            author.find(element).remove();
        }
        body.contents().filter((index, node) => node.type === 'comment').remove();

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            article_header: article_header,
            article_tags: article_tags,
            author: author,
            published: published,
            bg_img: bg_img,
            bg_img_video: bg_img_video,
            article_subtitle: article_subtitle,
            media_subtitle: media_subtitle,
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss){
        const post_urls = rss.items.map((datum) => datum.url);
        Promise.all(post_urls.map( (uri) => ingest_article(hatch, uri) )).then( () => {
            return hatch.finish();
        });
    });
}

main();
